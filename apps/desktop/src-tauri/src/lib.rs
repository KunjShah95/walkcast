use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::{
  menu::{Menu, MenuItemBuilder, PredefinedMenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  AppHandle, LogicalSize, Manager, RunEvent, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_updater::{Update, UpdaterExt};

/// The app server the window talks to. In a release build it is the bundled Node running
/// `sidecar.ts` on a free loopback port; `tauri dev` uses the server `npm run ui` already started.
struct Sidecar(Mutex<Option<CommandChild>>);

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

/// Stop the sidecar on purpose.
fn stop_sidecar(app: &AppHandle) {
  QUITTING.store(true, Ordering::SeqCst);
  if let Some(child) = app.state::<Sidecar>().0.lock().unwrap().take() {
    let _ = child.kill();
  }
}
const STARTUP_TIMEOUT: Duration = Duration::from_secs(60);

/// Sign-in redirects come back to http://127.0.0.1:<port>/auth/..., and Supabase only redirects to
/// allow-listed URLs, so the app keeps one well-known port. Another one is used only if it is taken
/// (the app still works; Google sign-in and email links then can't come back).
const PREFERRED_PORT: u16 = 4317;

fn free_port() -> std::io::Result<u16> {
  if TcpListener::bind(("127.0.0.1", PREFERRED_PORT)).is_ok() {
    return Ok(PREFERRED_PORT);
  }
  log::warn!("port {PREFERRED_PORT} is in use; sign-in redirects will not reach this run");
  Ok(TcpListener::bind("127.0.0.1:0")?.local_addr()?.port())
}

/// True once GET /healthz answers 200. Plain HTTP over a socket: no client library for one request.
fn healthy(port: u16) -> bool {
  let Ok(mut stream) = TcpStream::connect_timeout(&([127, 0, 0, 1], port).into(), Duration::from_millis(500)) else {
    return false;
  };
  let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
  if stream.write_all(b"GET /healthz HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n").is_err() {
    return false;
  };
  let mut head = [0u8; 12];
  stream.read_exact(&mut head).is_ok() && head.ends_with(b"200")
}

/// GET a path from the app server and hand back the whole response. One loopback request, so no
/// client library.
fn http_get(port: u16, path: &str) -> Option<String> {
  let mut stream = TcpStream::connect_timeout(&([127, 0, 0, 1], port).into(), Duration::from_millis(500)).ok()?;
  stream.set_read_timeout(Some(Duration::from_secs(3))).ok()?;
  stream
    .write_all(format!("GET {path} HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n").as_bytes())
    .ok()?;
  let mut body = String::new();
  stream.read_to_string(&mut body).ok()?;
  Some(body)
}

/// Whether the server's job worker is mid-recording. This is what lets the app keep recording with
/// the window closed, and what makes a quit wait for the walkthrough instead of killing it.
fn recording(port: u16) -> bool {
  http_get(port, "/healthz").is_some_and(|body| body.contains("\"worker\":\"busy\""))
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
    .build()?;
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

fn start_sidecar(app: &AppHandle, exited: Arc<AtomicBool>) -> Result<u16, Box<dyn std::error::Error>> {
  let port = free_port()?;
  let resources = plain(app.path().resource_dir()?).join("sidecar");
  let data = plain(app.path().app_data_dir()?);
  std::fs::create_dir_all(&data)?;
  let loader = Url::from_file_path(resources.join("node_modules").join("tsx").join("dist").join("loader.mjs"))
    .map_err(|_| "resource path is not absolute")?;
  let entry = resources.join("apps").join("desktop").join("sidecar.ts");

  let (mut events, child) = app
    .shell()
    .sidecar("walkcast-node")?
    .args(["--import", loader.as_str()])
    .arg(entry)
    .args(["--port", &port.to_string()])
    .current_dir(&data)
    .env("WALKCAST_PARENT_STDIN", "1")
    .spawn()?;
  app.state::<Sidecar>().0.lock().unwrap().replace(child);

  let app = app.clone();
  tauri::async_runtime::spawn(async move {
    while let Some(event) = events.recv().await {
      match event {
        CommandEvent::Stdout(line) => log::info!("sidecar: {}", String::from_utf8_lossy(&line).trim_end()),
        CommandEvent::Stderr(line) => log::warn!("sidecar: {}", String::from_utf8_lossy(&line).trim_end()),
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
  let port = app.state::<Port>().0.lock().unwrap().to_owned();
  if !recording(port) {
    app.exit(0);
    return;
  }
  log::info!("quit asked for during a recording; waiting for it to finish");
  let app = app.clone();
  set_tray_tooltip(&app, "Walkcast — finishing the recording, then quitting…");
  std::thread::spawn(move || {
    // Long enough for any walkthrough this build can start; past that, the person gave up on it.
    let deadline = Instant::now() + Duration::from_secs(30 * 60);
    while Instant::now() < deadline {
      std::thread::sleep(Duration::from_secs(3));
      if !recording(port) {
        app.exit(0);
        return;
      }
    }
    log::warn!("gave up waiting for the recording; quitting");
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
      let now = recording(port);
      if now != busy {
        busy = now;
        set_tray_tooltip(
          &app,
          if now { "Walkcast — recording…" } else { "Walkcast" },
        );
      }
    }
  });
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
    .plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .invoke_handler(tauri::generate_handler![check_update, install_update])
    .manage(Sidecar(Mutex::new(None)))
    .manage(PendingUpdate::default())
    .manage(Port(Mutex::new(0)))
    .setup(|app| {
      let handle = app.handle().clone();
      build_tray(&handle)?;
      // Closing the window hides it: the recording runs in the sidecar, so closing mid-walkthrough
      // used to throw it away. The tray's "Quit Walkcast" is the way out, and it waits for a job.
      if let Some(window) = app.get_webview_window("main") {
        let (handle, on_window) = (handle.clone(), window.clone());
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
      if cfg!(debug_assertions) {
        open_window(&handle, WebviewUrl::External(Url::parse(DEV_URL)?))?;
        return Ok(());
      }
      // The splash (apps/desktop/splash) shows at once; the app replaces it when the server answers.
      let window = open_window(&handle, WebviewUrl::App("index.html".into()))?;
      let exited = Arc::new(AtomicBool::new(false));
      let port = match start_sidecar(&handle, exited.clone()) {
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

  /// The dashboard is served by the sidecar, not from the bundle, so the capability that grants it
  /// `check_update`/`install_update` is scoped by `remote.urls`. Tauri resolves that with
  /// `RemoteUrlPattern::test`, and a pattern that quietly fails to match would leave the app
  /// exactly as broken as it was with no pattern at all -- so the real matcher is exercised here,
  /// against the string in capabilities/updates.json.
  const REMOTE_URL_PATTERN: &str = "http://127.0.0.1:*";

  fn matches(url: &str) -> bool {
    let pattern = RemoteUrlPattern::from_str(REMOTE_URL_PATTERN).expect("capability pattern parses");
    pattern.test(&url.parse().expect("a valid url"))
  }

  #[test]
  fn loopback_pattern_covers_the_sidecar_and_dev_urls() {
    // PREFERRED_PORT, a free-port fallback, and the `tauri dev` server.
    for url in ["http://127.0.0.1:4317/app", "http://127.0.0.1:53124/app", "http://127.0.0.1:4320/app"] {
      assert!(matches(url), "the updater capability must apply to {url}");
    }
  }

  #[test]
  fn loopback_pattern_is_not_a_blanket_grant() {
    assert!(!matches("http://example.com:4317/app"), "must not match another host");
    assert!(!matches("http://localhost:4317/app"), "must not match another host name");
  }
}
