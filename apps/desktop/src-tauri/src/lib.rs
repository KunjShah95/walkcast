use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use tauri::{
  menu::{Menu, MenuItemBuilder, PredefinedMenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  AppHandle, LogicalSize, Manager, RunEvent, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_updater::{Update, UpdaterExt};

/// The app server the window talks to. In a release build it is the bundled Node running the
/// pre-bundled `sidecar.mjs` on a loopback port; `tauri dev` uses the server `npm run ui` already
/// started. The flag flips when that process's Terminated event arrives, which is how a graceful
/// stop knows the server is gone without killing it.
struct Sidecar(Mutex<Option<(CommandChild, Arc<AtomicBool>)>>);

/// A release downloaded in the background at launch, waiting for the person to restart into it.
#[derive(Default)]
struct PendingUpdate(Mutex<Option<(Update, Vec<u8>)>>);

const DEV_URL: &str = "http://127.0.0.1:4320/app";

/// Set when the app itself stops the sidecar (quit, installing an update), so its exit is expected
/// rather than a crash to recover from.
static QUITTING: AtomicBool = AtomicBool::new(false);
/// Crash restarts this session; past the cap the window says what happened instead.
static RESTARTS: AtomicUsize = AtomicUsize::new(0);
/// Set once the window shows the app (not the splash): from then on a sidecar exit is a crash to
/// recover from; before it, the startup wait reports the failure on the splash.
static SHOWN: AtomicBool = AtomicBool::new(false);
const MAX_RESTARTS: usize = 3;

/// How long a graceful stop waits for the server to finish its in-flight job and exit by itself
/// (the server gives the job ~25 s) before the process is killed.
const GRACEFUL_STOP: Duration = Duration::from_secs(30);

/// Stop the sidecar on purpose: ask it to shut down (it stops claiming jobs, lets the running one
/// finish or checkpoint, closes and exits 0), wait for it to go, and only then kill it. A plain
/// kill is TerminateProcess on Windows: no handler runs and an in-flight recording is lost.
fn stop_sidecar(app: &AppHandle) {
  QUITTING.store(true, Ordering::SeqCst);
  let Some((child, exited)) = app.state::<Sidecar>().0.lock().unwrap().take() else { return };
  let port = app.state::<Port>().0.lock().unwrap().to_owned();
  if port != 0 && !exited.load(Ordering::SeqCst) {
    let deadline = Instant::now() + GRACEFUL_STOP;
    if request_shutdown(port) {
      log::info!("asked the app server to shut down; waiting for it to exit");
      while Instant::now() < deadline && !exited.load(Ordering::SeqCst) {
        std::thread::sleep(Duration::from_millis(250));
      }
    } else {
      // A server without /api/shutdown (or one that refused): at least don't cut a job off
      // mid-step if it is about to finish, then fall through to the kill.
      log::warn!("the app server did not accept a shutdown request; waiting for its worker to go idle");
      while Instant::now() < deadline && !exited.load(Ordering::SeqCst) && worker_state(port) == Some(Worker::Busy) {
        std::thread::sleep(Duration::from_millis(500));
      }
    }
  }
  if exited.load(Ordering::SeqCst) {
    log::info!("app server exited on its own");
  } else {
    log::warn!("app server still running after the graceful stop; killing it");
    let _ = child.kill();
  }
}
const STARTUP_TIMEOUT: Duration = Duration::from_secs(60);

/// Sign-in redirects come back to http://127.0.0.1:<port>/auth/..., and Supabase only redirects to
/// allow-listed URLs, so the app keeps one well-known port. If it is taken, the next free port in a
/// small fixed range is used (sign-in then returns through walkcast:// instead). The range is fixed
/// rather than OS-assigned so the capabilities that grant the dashboard IPC can name these ports
/// exactly (capabilities/*.json, checked by the tests below) instead of every loopback port.
const PREFERRED_PORT: u16 = 4317;
const PORT_RANGE: std::ops::RangeInclusive<u16> = 4317..=4326;

fn free_port() -> std::io::Result<u16> {
  for port in PORT_RANGE {
    if TcpListener::bind(("127.0.0.1", port)).is_ok() {
      if port != PREFERRED_PORT {
        log::warn!("port {PREFERRED_PORT} is in use; using {port} (sign-in returns through walkcast://)");
      }
      return Ok(port);
    }
  }
  Err(std::io::Error::new(
    std::io::ErrorKind::AddrInUse,
    format!("ports {}-{} are all in use", PORT_RANGE.start(), PORT_RANGE.end()),
  ))
}

/// True once GET /healthz answers 200. Plain HTTP over a socket: no client library for one request.
fn healthy(port: u16) -> bool {
  let Ok(mut stream) = TcpStream::connect_timeout(&([127, 0, 0, 1], port).into(), Duration::from_millis(500)) else {
    return false;
  };
  let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
  if write!(stream, "GET /healthz HTTP/1.0\r\nHost: 127.0.0.1:{port}\r\n\r\n").is_err() {
    return false;
  };
  let mut head = [0u8; 12];
  stream.read_exact(&mut head).is_ok() && head.ends_with(b"200")
}

/// One loopback request to the app server; hands back the status code and body. No client library
/// for a request this small.
fn http_request(port: u16, method: &str, path: &str, headers: &[(&str, &str)]) -> Option<(u16, String)> {
  let mut stream = TcpStream::connect_timeout(&([127, 0, 0, 1], port).into(), Duration::from_millis(500)).ok()?;
  stream.set_read_timeout(Some(Duration::from_secs(3))).ok()?;
  let mut request = format!("{method} {path} HTTP/1.0\r\nHost: 127.0.0.1:{port}\r\nContent-Length: 0\r\n");
  for (name, value) in headers {
    request.push_str(&format!("{name}: {value}\r\n"));
  }
  request.push_str("\r\n");
  stream.write_all(request.as_bytes()).ok()?;
  let mut response = String::new();
  stream.read_to_string(&mut response).ok()?;
  parse_response(&response)
}

/// Status code and body of a raw HTTP/1.x response.
fn parse_response(response: &str) -> Option<(u16, String)> {
  let status = response.split_whitespace().nth(1)?.parse().ok()?;
  let body = response.split_once("\r\n\r\n").map(|(_, b)| b).unwrap_or_default();
  Some((status, body.to_string()))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Worker {
  Busy,
  Idle,
}

/// The `worker` field of a /readyz or /healthz body: "busy", "idle" (or "off", read as idle).
fn parse_worker(body: &str) -> Option<Worker> {
  let value: serde_json::Value = serde_json::from_str(body.trim()).ok()?;
  match value.get("worker")?.as_str()? {
    "busy" => Some(Worker::Busy),
    _ => Some(Worker::Idle),
  }
}

/// What the server's job worker is doing. /readyz reports it; newer servers also put it on
/// /healthz, which answers even while the store is slow. None when neither says.
fn worker_state(port: u16) -> Option<Worker> {
  ["/readyz", "/healthz"]
    .iter()
    .find_map(|path| http_request(port, "GET", path, &[]).and_then(|(_, body)| parse_worker(&body)))
}

/// Whether the server's job worker is mid-recording. This is what lets the app keep recording with
/// the window closed, and what makes a quit wait for the walkthrough instead of killing it.
fn recording(port: u16) -> bool {
  worker_state(port) == Some(Worker::Busy)
}

/// POST /api/shutdown with this run's token. True when the server accepted it.
fn request_shutdown(port: u16) -> bool {
  let token = shutdown_token();
  http_request(port, "POST", "/api/shutdown", &[("x-walkcast-shutdown", token)])
    .is_some_and(|(status, _)| (200..300).contains(&status))
}

/// A fresh random token per app run, handed to the sidecar in its environment so only this
/// process can ask it to shut down.
fn shutdown_token() -> &'static str {
  static TOKEN: OnceLock<String> = OnceLock::new();
  TOKEN.get_or_init(|| random_hex(32))
}

fn random_hex(bytes: usize) -> String {
  let mut buf = vec![0u8; bytes];
  getrandom::fill(&mut buf).expect("the OS random source is available");
  hex(&buf)
}

fn hex(bytes: &[u8]) -> String {
  bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn is_master_key(value: &str) -> bool {
  value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit())
}

/// The key the server encrypts stored credentials and seals jobs with, kept in the OS keychain
/// (Windows Credential Manager, macOS Keychain, Secret Service on Linux) rather than in a file next
/// to the data it protects. Created on first run. None (and a warning) when there is no usable
/// keychain: the server then falls back to its own key file.
fn master_key() -> Option<&'static str> {
  static KEY: OnceLock<Option<String>> = OnceLock::new();
  KEY
    .get_or_init(|| match load_or_create_master_key() {
      Ok(key) => Some(key),
      Err(e) => {
        log::warn!("OS keychain unavailable ({e}); the app server keeps its own key file");
        None
      }
    })
    .as_deref()
}

fn load_or_create_master_key() -> Result<String, keyring::Error> {
  let entry = keyring::Entry::new("walkcast", "master-key")?;
  match entry.get_password() {
    Ok(key) if is_master_key(&key) => return Ok(key),
    Ok(_) => log::warn!("the keychain's master key is malformed; replacing it"),
    Err(keyring::Error::NoEntry) => log::info!("creating the master key in the OS keychain"),
    Err(e) => return Err(e),
  }
  let key = random_hex(32);
  entry.set_password(&key)?;
  // Read it back: a keychain that accepts a write but does not keep it (a locked or transient
  // store) must not hand the server a key it will never see again.
  match entry.get_password()? {
    stored if stored == key => Ok(key),
    _ => Err(keyring::Error::NoEntry),
  }
}

/// 1280×820, but never larger than the screen it opens on: on a laptop at 125-150% scaling that
/// size runs off the edge, and the dashboard's corner notices with it.
fn open_window(app: &AppHandle, url: WebviewUrl) -> tauri::Result<WebviewWindow> {
  let window = WebviewWindowBuilder::new(app, "main", url)
    .title("Walkcast")
    .inner_size(1280.0, 820.0)
    .min_inner_size(720.0, 520.0)
    .resizable(true)
    .visible(false)
    // Tauri's native file-drop handler swallows HTML5 drag-and-drop on Windows; the dashboard
    // takes dropped URLs itself, and nothing here listens for native drop events.
    .disable_drag_drop_handler()
    .build()?;
  // Closing the window hides it: the recording runs in the sidecar, so closing mid-walkthrough
  // used to throw it away. The tray's "Quit Walkcast" is the way out, and it waits for a job.
  // (Attached here, where the window is made: `setup` used to look the window up before it
  // existed, so the handler was never installed and closing the window quit the app.)
  {
    let (handle, on_window) = (app.clone(), window.clone());
    window.on_window_event(move |event| {
      if let WindowEvent::CloseRequested { api, .. } = event {
        // Nothing is running yet (the server failed to start): closing really means closing.
        if handle.state::<Port>().0.lock().unwrap().to_owned() == 0 {
          return;
        }
        api.prevent_close();
        let _ = on_window.hide();
      }
    });
  }
  if let Ok(Some(monitor)) = window.current_monitor() {
    let scale = monitor.scale_factor();
    let area = monitor.work_area().size;
    let width = (area.width as f64 / scale * 0.92).min(1280.0);
    let height = (area.height as f64 / scale * 0.9).min(820.0);
    let _ = window.set_size(LogicalSize::new(width, height));
    let _ = window.center();
  }
  window.show()?;
  Ok(window)
}

/// Replace the splash's "Starting…" line with what went wrong, so a failed start says so.
fn show_failure(window: &WebviewWindow, message: &str) {
  let text = serde_json::to_string(message).unwrap_or_else(|_| "\"Walkcast could not start.\"".into());
  let _ = window.eval(&format!("document.querySelector('p').textContent = {text}; document.querySelector('.bar').remove();"));
}

/// Windows hands back verbatim paths (`\\?\C:\...`), which Node cannot resolve a main module from.
/// Drop the prefix when what follows is an ordinary drive path.
fn plain(path: PathBuf) -> PathBuf {
  let s = path.to_string_lossy();
  match s.strip_prefix(r"\\?\") {
    Some(rest) if rest.as_bytes().get(1) == Some(&b':') => PathBuf::from(rest),
    _ => path,
  }
}

/// Whether a sidecar stderr line reads as an error (a stack, an `"level":"error"` log line, an
/// `ERR_*` code) rather than progress Node or a dependency happened to print there.
fn looks_like_error(line: &str) -> bool {
  line.contains("error") || line.contains("Error") || line.contains("ERR")
}

fn start_sidecar(app: &AppHandle, exited: Arc<AtomicBool>) -> Result<u16, Box<dyn std::error::Error>> {
  let port = free_port()?;
  let resources = plain(app.path().resource_dir()?).join("sidecar");
  let data = plain(app.path().app_data_dir()?);
  std::fs::create_dir_all(&data)?;
  // The staging script pre-bundles the server into one ESM file, so plain Node starts it without
  // transpiling hundreds of TypeScript files on every launch. A stage without the bundle (or one
  // made by an older script) still runs the sources through tsx.
  let bundle = resources.join("apps").join("desktop").join("sidecar.mjs");
  let mut command = app.shell().sidecar("walkcast-node")?;
  if bundle.is_file() {
    command = command.arg(bundle);
  } else {
    log::warn!("no pre-bundled sidecar; running the sources through tsx");
    let loader = Url::from_file_path(resources.join("node_modules").join("tsx").join("dist").join("loader.mjs"))
      .map_err(|_| "resource path is not absolute")?;
    command = command
      .args(["--import", loader.as_str()])
      .arg(resources.join("apps").join("desktop").join("sidecar.ts"));
  }
  let mut command = command
    .args(["--port", &port.to_string()])
    .current_dir(&data)
    .env("WALKCAST_PARENT_STDIN", "1")
    .env("WALKCAST_DESKTOP", "1")
    .env("WALKCAST_SHUTDOWN_TOKEN", shutdown_token());
  if let Some(key) = master_key() {
    command = command.env("WALKCAST_MASTER_KEY", key);
  }
  let (mut events, child) = command.spawn()?;
  app.state::<Sidecar>().0.lock().unwrap().replace((child, exited.clone()));

  let app = app.clone();
  tauri::async_runtime::spawn(async move {
    while let Some(event) = events.recv().await {
      match event {
        CommandEvent::Stdout(line) => log::info!("sidecar: {}", String::from_utf8_lossy(&line).trim_end()),
        // Node writes ordinary progress to stderr too; only lines that read as errors are errors.
        CommandEvent::Stderr(line) => {
          let line = String::from_utf8_lossy(&line);
          let line = line.trim_end();
          if looks_like_error(line) {
            log::error!("sidecar: {line}");
          } else {
            log::info!("sidecar: {line}");
          }
        }
        CommandEvent::Terminated(status) => {
          exited.store(true, Ordering::SeqCst);
          if QUITTING.load(Ordering::SeqCst) {
            log::info!("sidecar stopped: {:?}", status.code);
          } else {
            log::error!("sidecar exited: {:?}", status.code);
            restart_after_crash(&app);
          }
        }
        _ => {}
      }
    }
  });
  Ok(port)
}

/// The app server died on its own after the window was showing it: start a new one and point the
/// window at it, rather than leaving a dashboard whose every request fails. A crash during startup
/// is left to the startup wait, which reports it on the splash.
fn restart_after_crash(app: &AppHandle) {
  if !SHOWN.load(Ordering::SeqCst) {
    return;
  }
  let Some(window) = app.get_webview_window("main") else { return };
  if RESTARTS.fetch_add(1, Ordering::SeqCst) >= MAX_RESTARTS {
    let logs = app.path().app_log_dir().map(|p| p.display().to_string()).unwrap_or_default();
    let text = serde_json::to_string(&format!("Walkcast's server keeps stopping. Restart the app; the log is in {logs}")).unwrap_or_default();
    let _ = window.eval(&format!("document.body.innerHTML = '<p style=\"font:15px system-ui;padding:32px\"></p>'; document.querySelector('p').textContent = {text};"));
    return;
  }
  let app = app.clone();
  std::thread::spawn(move || {
    let exited = Arc::new(AtomicBool::new(false));
    let port = match start_sidecar(&app, exited.clone()) {
      Ok(port) => port,
      Err(e) => {
        log::error!("could not restart the app server: {e}");
        return;
      }
    };
    *app.state::<Port>().0.lock().unwrap() = port;
    let started = Instant::now();
    while started.elapsed() < STARTUP_TIMEOUT && !exited.load(Ordering::SeqCst) {
      if healthy(port) {
        log::info!("app server restarted on port {port}");
        if let Ok(url) = Url::parse(&format!("http://127.0.0.1:{port}/app")) {
          let _ = window.navigate(url);
        }
        return;
      }
      std::thread::sleep(Duration::from_millis(200));
    }
    log::error!("the restarted app server did not come up");
  });
}

/// What the dashboard's Updates section shows. `available` is false when this is the newest
/// release, or when the check could not reach GitHub (then `error` says why).
#[derive(serde::Serialize)]
struct UpdateStatus {
  current: String,
  available: bool,
  version: Option<String>,
  notes: Option<String>,
  date: Option<String>,
  error: Option<String>,
}

/// Ask the release feed (tauri.conf.json → plugins.updater.endpoints) whether a newer, signed
/// build exists. Never fails: a network error comes back as `error` so the UI can say so.
#[tauri::command]
async fn check_update(app: AppHandle) -> UpdateStatus {
  let current = app.package_info().version.to_string();
  let checked = match app.updater() {
    Ok(updater) => updater.check().await.map_err(|e| e.to_string()),
    Err(e) => Err(e.to_string()),
  };
  match checked {
    Ok(Some(update)) => UpdateStatus {
      current,
      available: true,
      version: Some(update.version.clone()),
      notes: update.body.clone(),
      date: update.date.map(|d| d.to_string()),
      error: None,
    },
    Ok(None) => UpdateStatus { current, available: false, version: None, notes: None, date: None, error: None },
    Err(e) => UpdateStatus { current, available: false, version: None, notes: None, date: None, error: Some(e) },
  }
}

/// Download the update, verify its signature against the public key built into this app, install
/// it and restart. The sidecar is stopped first so the installer can replace its files.
#[tauri::command]
async fn install_update(app: AppHandle) -> Result<(), String> {
  // Already downloaded at launch: install it rather than fetching the same bytes again.
  let pending = app.state::<PendingUpdate>().0.lock().unwrap().take();
  if let Some((update, bytes)) = pending {
    install_or_recover(&app, &update, bytes)?;
  }
  let update = app
    .updater()
    .map_err(|e| e.to_string())?
    .check()
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Walkcast is already up to date.".to_string())?;
  log::info!("downloading update {}", update.version);
  let window = app.get_webview_window("main");
  let label = format!("Downloading Walkcast {}", update.version);
  let mut update = update;
  let bytes = download(&mut update, |progress| {
    if let Some(window) = &window {
      let text = serde_json::to_string(&format!("{label}… {progress}")).unwrap_or_default();
      let _ = window.eval(&format!("(() => {{ const t = document.querySelector('#walkcast-update span'); if (t) t.textContent = {text}; }})();"));
    }
  })
  .await
  .map_err(|e| e.to_string())?;
  install_or_recover(&app, &update, bytes)
}

/// Stop the server (the installer replaces its files), install and restart. If the install fails,
/// bring the server back so the open window keeps working, and hand back why.
fn install_or_recover(app: &AppHandle, update: &Update, bytes: Vec<u8>) -> Result<(), String> {
  stop_sidecar(app);
  if let Err(e) = update.install(bytes) {
    log::error!("update install failed: {e}");
    // Let the stopped server's exit event arrive while QUITTING still marks it expected, or it
    // would read as a crash and start a second server alongside this one.
    std::thread::sleep(Duration::from_millis(1500));
    QUITTING.store(false, Ordering::SeqCst);
    restart_after_crash(app);
    return Err(e.to_string());
  }
  log::info!("update {} installed; restarting", update.version);
  app.restart();
}

/// How long a launch waits for the update feed before opening the app anyway.
const LAUNCH_CHECK_TIMEOUT: Duration = Duration::from_secs(10);
/// How long the splash waits for a release to download before opening the app and finishing the
/// download in the background.
const LAUNCH_DOWNLOAD_WAIT: Duration = Duration::from_secs(20);
/// The whole installer download. An `Update` inherits the check's timeout, and reqwest applies it
/// to the entire body: at 10 s, anything slower than ~30 Mbit/s failed every launch and the app
/// opened on the old version again after the wait.
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(15 * 60);

/// Download a release, telling `report` how far along it is ("42% of 35 MB") as the percent moves.
async fn download(update: &mut Update, mut report: impl FnMut(String)) -> tauri_plugin_updater::Result<Vec<u8>> {
  update.timeout = Some(DOWNLOAD_TIMEOUT);
  let (mut done, mut shown) = (0u64, None);
  update
    .download(
      |chunk, total| {
        done += chunk as u64;
        let Some(total) = total.filter(|t| *t > 0) else { return };
        let percent = (done * 100 / total).min(100);
        if shown != Some(percent) {
          shown = Some(percent);
          report(format!("{percent}% of {} MB", (total + 524_288) / 1_048_576));
        }
      },
      || {},
    )
    .await
}
/// How often a running app looks for a new release.
const RECHECK_EVERY: Duration = Duration::from_secs(6 * 60 * 60);

fn set_splash(window: &WebviewWindow, message: &str) {
  let text = serde_json::to_string(message).unwrap_or_else(|_| "\"Updating Walkcast…\"".into());
  let _ = window.eval(&format!("document.querySelector('p').textContent = {text};"));
}

fn auto_update_disabled() -> bool {
  std::env::var("WALKCAST_NO_AUTO_UPDATE").map(|v| v == "1").unwrap_or(false)
}

/// At launch, before the app opens: if a newer signed release exists, install it and restart into
/// it, so people are always on the latest version without doing anything. Returns false (open the
/// app as usual) when there is no update, the feed can't be reached in time, or anything fails.
async fn update_at_launch(app: &AppHandle, window: &WebviewWindow) -> bool {
  if auto_update_disabled() {
    return false;
  }
  let updater = match app.updater_builder().timeout(LAUNCH_CHECK_TIMEOUT).build() {
    Ok(updater) => updater,
    Err(e) => {
      log::warn!("updater unavailable: {e}");
      return false;
    }
  };
  let update = match updater.check().await {
    Ok(Some(update)) => update,
    Ok(None) => return false,
    Err(e) => {
      log::warn!("update check failed at launch: {e}");
      return false;
    }
  };
  log::info!("updating to {} at launch", update.version);
  let version = update.version.clone();
  let label = format!("Updating Walkcast to {version}…");
  set_splash(window, &label);
  // Download in the background and give it a short while. On a slow line the app opens instead of
  // holding the splash for minutes; the download carries on and offers a restart when it lands.
  let waiting = Arc::new(AtomicBool::new(true));
  let (tx, rx) = std::sync::mpsc::channel::<bool>();
  {
    let (app, window, waiting, version) = (app.clone(), window.clone(), waiting.clone(), version.clone());
    tauri::async_runtime::spawn(async move {
      let mut update = update;
      match download(&mut update, |progress| {
        if waiting.load(Ordering::SeqCst) {
          set_splash(&window, &format!("{label} {progress}"));
        }
      })
      .await
      {
        Ok(bytes) => {
          app.state::<PendingUpdate>().0.lock().unwrap().replace((update, bytes));
          let _ = tx.send(true);
          if !waiting.load(Ordering::SeqCst) {
            log::info!("update {version} downloaded in the background; offering a restart");
            show_update_banner(&window, &version);
          }
        }
        Err(e) => {
          log::warn!("update download failed: {e}");
          let _ = tx.send(false);
        }
      }
    });
  }
  let finished = rx.recv_timeout(LAUNCH_DOWNLOAD_WAIT);
  waiting.store(false, Ordering::SeqCst);
  if matches!(finished, Ok(false)) {
    return false;
  }
  // Landed in time (or in the instant after the wait ended): install now.
  let Some((update, bytes)) = app.state::<PendingUpdate>().0.lock().unwrap().take() else {
    log::info!("update {version} still downloading; opening the app meanwhile");
    return false;
  };
  stop_sidecar(app);
  if let Err(e) = update.install(bytes) {
    log::error!("update install failed: {e}");
    // The server was stopped for the installer. Let its exit arrive while QUITTING still marks it
    // expected; the caller then starts a new one. (It used to open the app on a dead server: the
    // splash said "stopped while starting" until the next launch.)
    std::thread::sleep(Duration::from_millis(1500));
    QUITTING.store(false, Ordering::SeqCst);
    return false;
  }
  app.restart();
}

/// The dashboard's corner banner offering a restart into `version`. One at a time; dismissable.
fn show_update_banner(window: &WebviewWindow, version: &str) {
  let label = serde_json::to_string(&format!("Walkcast {version} is ready.")).unwrap_or_default();
  let _ = window.eval(&format!(
    r#"(() => {{
  if (document.getElementById("walkcast-update")) return;
  const bar = document.createElement("div");
  bar.id = "walkcast-update";
  bar.setAttribute("role", "status");
  bar.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;display:flex;gap:10px;align-items:center;padding:12px 14px;border-radius:14px;background:var(--paper,#ffffff);color:var(--ink,#1b1a17);font:13.5px 'Schibsted Grotesk Variable',ui-sans-serif,system-ui,sans-serif;box-shadow:inset 0 0 0 1px var(--line,#e7e3db),0 12px 28px -20px rgb(27 26 23 / .35)";
  const text = document.createElement("span");
  text.textContent = {label};
  const go = document.createElement("button");
  go.textContent = "Restart now";
  go.style.cssText = "border:0;border-radius:999px;padding:6px 12px;background:var(--signal,#9c5700);color:var(--on-signal,#ffffff);font-weight:600;cursor:pointer";
  go.onclick = () => {{ go.disabled = true; go.textContent = "Updating…"; window.__TAURI__.core.invoke("install_update").catch((e) => {{ go.textContent = "Update failed"; text.textContent = String(e); }}); }};
  // Dismissable: an update is never forced, and a stuck banner over a dark recording is annoying.
  const close = document.createElement("button");
  close.textContent = "×";
  close.setAttribute("aria-label", "Dismiss");
  close.style.cssText = "border:0;background:transparent;color:#8a847a;font:16px system-ui,sans-serif;cursor:pointer;padding:0 4px;line-height:1";
  close.onclick = () => bar.remove();
  bar.append(text, go, close);
  document.body.append(bar);
}})();"#
  ));
}

/// While the app runs: look for a release every few hours and, when one appears, show a banner in
/// the dashboard with a one-click restart. If it's ignored, the next launch installs it anyway.
fn watch_for_updates(app: AppHandle, window: WebviewWindow) {
  if auto_update_disabled() {
    return;
  }
  std::thread::spawn(move || loop {
    std::thread::sleep(RECHECK_EVERY);
    let found = tauri::async_runtime::block_on(async {
      app.updater().ok()?.check().await.ok().flatten().map(|u| u.version)
    });
    if let Some(version) = found {
      log::info!("update {version} is available; offering a restart");
      show_update_banner(&window, &version);
    }
  });
}

/// Where the app server is listening, kept for the tray's background checks.
#[derive(Default)]
struct Port(Mutex<u16>);

/// The tray icon: the app's front door once the window is closed, and the only place a quit comes
/// from. Closing the window hides it; the recording keeps running in the sidecar either way.
fn build_tray(app: &AppHandle) -> tauri::Result<()> {
  let open = MenuItemBuilder::with_id("open", "Open Walkcast").build(app)?;
  let quit = MenuItemBuilder::with_id("quit", "Quit Walkcast").build(app)?;
  let menu = Menu::with_items(app, &[&open, &PredefinedMenuItem::separator(app)?, &quit])?;
  let mut tray = TrayIconBuilder::with_id("tray")
    .tooltip("Walkcast")
    .menu(&menu)
    .on_menu_event(|app, event| match event.id().as_ref() {
      "open" => show_window(app),
      "quit" => request_quit(app),
      _ => {}
    })
    .on_tray_icon_event(|tray, event| {
      if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
        show_window(tray.app_handle());
      }
    });
  if let Some(icon) = app.default_window_icon().cloned() {
    tray = tray.icon(icon);
  }
  tray.build(app)?;
  Ok(())
}

fn show_window(app: &AppHandle) {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
  }
}

/// Quit, but never mid-recording: a walkthrough takes minutes and killing the sidecar throws it
/// away. While one is running the app stays alive, says so in the tray, and quits when it lands.
fn request_quit(app: &AppHandle) {
  static REQUESTED: AtomicBool = AtomicBool::new(false);
  if REQUESTED.swap(true, Ordering::SeqCst) {
    return; // already on its way out (a second click on Quit while waiting)
  }
  let app = app.clone();
  // Off the main thread: the waits below are seconds to minutes and the tray must stay live.
  std::thread::spawn(move || {
    let port = app.state::<Port>().0.lock().unwrap().to_owned();
    if recording(port) {
      log::info!("quit asked for during a recording; waiting for it to finish");
      set_tray_tooltip(&app, "Walkcast — finishing the recording, then quitting…");
      // Long enough for any walkthrough this build can start; past that, the person gave up on it.
      let deadline = Instant::now() + Duration::from_secs(30 * 60);
      while Instant::now() < deadline && recording(port) {
        std::thread::sleep(Duration::from_secs(3));
      }
      if Instant::now() >= deadline {
        log::warn!("gave up waiting for the recording; quitting");
      }
    }
    // Shut the server down cleanly here rather than in the exit handler, so the event loop is not
    // blocked while it goes. The exit handler then finds nothing left to stop.
    set_tray_tooltip(&app, "Walkcast — quitting…");
    stop_sidecar(&app);
    app.exit(0);
  });
}

fn set_tray_tooltip(app: &AppHandle, text: &str) {
  if let Some(tray) = app.tray_by_id("tray") {
    let _ = tray.set_tooltip(Some(text.to_string()));
  }
}

/// Keep the tray icon honest about what the sidecar is doing: the window can be closed for the
/// length of a recording, and this is the only sign of it that anything is still happening.
fn watch_recording(app: &AppHandle) {
  let app = app.clone();
  std::thread::spawn(move || {
    let mut busy = false;
    // Reads the port each beat, so it follows a restarted server. (It used to loop while the
    // server's "exited" flag was true, i.e. never, and the tray never said it was recording.)
    while !QUITTING.load(Ordering::SeqCst) {
      std::thread::sleep(Duration::from_secs(4));
      let port = app.state::<Port>().0.lock().unwrap().to_owned();
      // An unanswered poll (a restart in progress, a slow store) keeps the last known state rather
      // than reading as "finished" and notifying about a job that is still running.
      let Some(state) = worker_state(port) else { continue };
      let now = state == Worker::Busy;
      if now != busy {
        set_tray_tooltip(
          &app,
          if now { "Walkcast — recording…" } else { "Walkcast" },
        );
        if busy && !now && !QUITTING.load(Ordering::SeqCst) {
          notify_job_finished(&app);
        }
        busy = now;
      }
    }
  });
}

/// A native notification when a job finishes, so a walkthrough recorded with the window closed or
/// behind other windows does not go unnoticed. Skipped when the person is looking at the app.
/// Clicking it: on Windows the toast activates the app, and the single-instance hand-off focuses
/// the running window; elsewhere the OS brings the app forward.
fn notify_job_finished(app: &AppHandle) {
  if let Some(window) = app.get_webview_window("main") {
    if window.is_visible().unwrap_or(false) && window.is_focused().unwrap_or(false) {
      return;
    }
  }
  if let Err(e) = app
    .notification()
    .builder()
    .title("Walkthrough ready")
    .body("Your Walkcast job finished. Open Walkcast to see it.")
    .show()
  {
    log::warn!("could not show the job-finished notification: {e}");
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // Must be first: a second launch must focus the running app and exit rather than start a
    // second sidecar on a random port, which is the usual reason 4317 is unavailable.
    .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
      if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
      }
    }))
    .plugin(tauri_plugin_deep_link::init())
    .plugin(
      tauri_plugin_log::Builder::default()
        .level(log::LevelFilter::Info)
        // The sidecar logs every request and job step: unbounded, one file grew for months.
        .max_file_size(5 * 1024 * 1024)
        .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(5))
        .build(),
    )
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .invoke_handler(tauri::generate_handler![check_update, install_update])
    .manage(Sidecar(Mutex::new(None)))
    .manage(PendingUpdate::default())
    .manage(Port(Mutex::new(0)))
    .setup(|app| {
      let handle = app.handle().clone();
      build_tray(&handle)?;
      if cfg!(debug_assertions) {
        open_window(&handle, WebviewUrl::External(Url::parse(DEV_URL)?))?;
        return Ok(());
      }
      // The splash (apps/desktop/splash) shows at once; the app replaces it when the server answers.
      let window = open_window(&handle, WebviewUrl::App("index.html".into()))?;
      // An AppImage has no installer to register walkcast://, so the running app does it.
      #[cfg(target_os = "linux")]
      {
        use tauri_plugin_deep_link::DeepLinkExt;
        if let Err(e) = handle.deep_link().register_all() {
          log::warn!("could not register the walkcast:// scheme: {e}");
        }
      }
      let mut exited = Arc::new(AtomicBool::new(false));
      let mut port = match start_sidecar(&handle, exited.clone()) {
        Ok(port) => port,
        Err(e) => {
          log::error!("could not start the app server: {e}");
          show_failure(&window, &format!("Walkcast could not start its server: {e}"));
          return Ok(());
        }
      };
      *handle.state::<Port>().0.lock().unwrap() = port;
      // Wait off the main thread so the event loop keeps running.
      std::thread::spawn(move || {
        // Install a pending release first, while the server boots rather than after it; on success
        // the app restarts and never gets past here.
        if !tauri::async_runtime::block_on(update_at_launch(&handle, &window)) {
          set_splash(&window, "Starting…");
        }
        // A failed install at launch stopped the server: start a fresh one.
        if handle.state::<Sidecar>().0.lock().unwrap().is_none() {
          exited = Arc::new(AtomicBool::new(false));
          match start_sidecar(&handle, exited.clone()) {
            Ok(p) => {
              port = p;
              *handle.state::<Port>().0.lock().unwrap() = p;
            }
            Err(e) => {
              log::error!("could not restart the app server after a failed update: {e}");
              show_failure(&window, &format!("Walkcast could not start its server: {e}"));
              return;
            }
          }
        }
        let started = Instant::now();
        while started.elapsed() < STARTUP_TIMEOUT && !exited.load(Ordering::SeqCst) {
          if healthy(port) {
            let url = Url::parse(&format!("http://127.0.0.1:{port}/app")).expect("a valid local URL");
            if let Err(e) = window.navigate(url) {
              log::error!("could not open the app: {e}");
            }
            SHOWN.store(true, Ordering::SeqCst);
            watch_for_updates(handle.clone(), window.clone());
            watch_recording(&handle);
            return;
          }
          std::thread::sleep(Duration::from_millis(200));
        }
        let why = if exited.load(Ordering::SeqCst) { "stopped while starting" } else { "did not start in time" };
        log::error!("the app server {why}");
        let logs = handle.path().app_log_dir().map(|p| p.display().to_string()).unwrap_or_default();
        show_failure(&window, &format!("Walkcast's server {why}. The log is in {logs}"));
      });
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app, event| {
      if let RunEvent::Exit = event {
        stop_sidecar(app);
      }
    });
}

#[cfg(test)]
mod tests {
  use std::str::FromStr;

  use tauri_utils::acl::RemoteUrlPattern;

  use super::*;

  /// The dashboard is served by the sidecar, not from the bundle, so the capabilities that grant it
  /// IPC are scoped by `remote.urls`. Tauri resolves those with `RemoteUrlPattern::test`, and a
  /// pattern that quietly fails to match would leave the app as broken as no pattern at all -- so
  /// the real matcher is exercised here, against the patterns in the shipped capability files.
  fn patterns(file: &str) -> Vec<RemoteUrlPattern> {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("capabilities").join(file);
    let json: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    json["remote"]["urls"]
      .as_array()
      .expect("remote.urls")
      .iter()
      .map(|u| RemoteUrlPattern::from_str(u.as_str().unwrap()).expect("capability pattern parses"))
      .collect()
  }

  fn matches(file: &str, url: &str) -> bool {
    let url = url.parse().expect("a valid url");
    patterns(file).iter().any(|p| p.test(&url))
  }

  #[test]
  fn capabilities_cover_every_port_the_sidecar_can_take() {
    for file in ["updates.json", "deep-link.json"] {
      for port in PORT_RANGE {
        for path in ["/app", "/app/library", "/login"] {
          let url = format!("http://127.0.0.1:{port}{path}");
          assert!(matches(file, &url), "{file} must apply to {url}");
        }
      }
      // The `tauri dev` server.
      assert!(matches(file, DEV_URL), "{file} must apply to {DEV_URL}");
    }
  }

  #[test]
  fn capabilities_are_not_a_blanket_grant() {
    for file in ["updates.json", "deep-link.json"] {
      assert!(!matches(file, "http://example.com:4317/app"), "must not match another host");
      assert!(!matches(file, "http://localhost:4317/app"), "must not match another host name");
      assert!(!matches(file, "http://127.0.0.1:53124/app"), "must not match a port outside the range");
      assert!(!matches(file, "http://127.0.0.1:4327/app"), "must not match a port outside the range");
    }
  }

  #[test]
  fn worker_state_is_read_from_json() {
    assert_eq!(parse_worker(r#"{"ok":true,"store":"local","media":"local","worker":"busy"}"#), Some(Worker::Busy));
    assert_eq!(parse_worker(r#"{ "ok": true, "worker": "idle" }"#), Some(Worker::Idle));
    assert_eq!(parse_worker(r#"{"ok":true,"worker":"off"}"#), Some(Worker::Idle));
    // Today's /healthz carries no worker field: unknown, not idle.
    assert_eq!(parse_worker(r#"{"ok":true}"#), None);
    assert_eq!(parse_worker("not json"), None);
  }

  #[test]
  fn responses_split_into_status_and_body() {
    let raw = "HTTP/1.1 503 Service Unavailable\r\nContent-Type: application/json\r\n\r\n{\"ok\":false}";
    assert_eq!(parse_response(raw), Some((503, "{\"ok\":false}".to_string())));
    assert_eq!(parse_response(""), None);
  }

  #[test]
  fn keys_and_tokens_are_32_bytes_of_hex() {
    let token = random_hex(32);
    assert!(is_master_key(&token));
    assert_ne!(token, random_hex(32));
    assert!(!is_master_key("abc"));
    assert!(!is_master_key(&"g".repeat(64)));
  }

  #[test]
  fn stderr_lines_are_errors_only_when_they_say_so() {
    assert!(looks_like_error(r#"{"level":"error","event":"http.error"}"#));
    assert!(looks_like_error("TypeError: x is not a function"));
    assert!(looks_like_error("code: 'ERR_MODULE_NOT_FOUND'"));
    assert!(!looks_like_error("Downloading Chromium 140.0 - 12% of 150 MB"));
  }
}
