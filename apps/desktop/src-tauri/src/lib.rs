use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::{
  menu::{Menu, MenuItemBuilder, PredefinedMenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  AppHandle, LogicalSize, Manager, RunEvent, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_updater::UpdaterExt;

/// The app server the window talks to. In a release build it is the bundled Node running
/// `sidecar.ts` on a free loopback port; `tauri dev` uses the server `npm run ui` already started.
struct Sidecar(Mutex<Option<CommandChild>>);

const DEV_URL: &str = "http://127.0.0.1:4320/app";
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

  tauri::async_runtime::spawn(async move {
    while let Some(event) = events.recv().await {
      match event {
        CommandEvent::Stdout(line) => log::info!("sidecar: {}", String::from_utf8_lossy(&line).trim_end()),
        CommandEvent::Stderr(line) => log::warn!("sidecar: {}", String::from_utf8_lossy(&line).trim_end()),
        CommandEvent::Terminated(status) => {
          log::error!("sidecar exited: {:?}", status.code);
          exited.store(true, Ordering::SeqCst);
        }
        _ => {}
      }
    }
  });
  Ok(port)
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
  let update = app
    .updater()
    .map_err(|e| e.to_string())?
    .check()
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Walkcast is already up to date.".to_string())?;
  log::info!("downloading update {}", update.version);
  let bytes = update.download(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
  if let Some(child) = app.state::<Sidecar>().0.lock().unwrap().take() {
    let _ = child.kill();
  }
  update.install(bytes).map_err(|e| e.to_string())?;
  log::info!("update {} installed; restarting", update.version);
  app.restart();
}

/// How long a launch waits for the update feed before opening the app anyway.
const LAUNCH_CHECK_TIMEOUT: Duration = Duration::from_secs(10);
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
  set_splash(window, &format!("Updating Walkcast to {}…", update.version));
  let bytes = match update.download(|_, _| {}, || {}).await {
    Ok(bytes) => bytes,
    Err(e) => {
      log::warn!("update download failed: {e}");
      return false;
    }
  };
  if let Some(child) = app.state::<Sidecar>().0.lock().unwrap().take() {
    let _ = child.kill();
  }
  if let Err(e) = update.install(bytes) {
    log::error!("update install failed: {e}");
    return false;
  }
  app.restart();
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
      let label = serde_json::to_string(&format!("Walkcast {version} is ready.")).unwrap_or_default();
      let _ = window.eval(&format!(
        r#"(() => {{
  if (document.getElementById("walkcast-update")) return;
  const bar = document.createElement("div");
  bar.id = "walkcast-update";
  bar.setAttribute("role", "status");
  bar.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;display:flex;gap:12px;align-items:center;padding:10px 14px;border-radius:12px;background:#1b1a17;color:#fff;font:14px system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25)";
  const text = document.createElement("span");
  text.textContent = {label};
  const go = document.createElement("button");
  go.textContent = "Restart now";
  go.style.cssText = "border:0;border-radius:999px;padding:6px 12px;background:#9c5700;color:#fff;font-weight:600;cursor:pointer";
  go.onclick = () => {{ go.disabled = true; go.textContent = "Updating…"; window.__TAURI__.core.invoke("install_update").catch((e) => {{ go.textContent = "Update failed"; text.textContent = String(e); }}); }};
  bar.append(text, go);
  document.body.append(bar);
}})();"#
      ));
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
fn watch_recording(app: &AppHandle, started: Arc<AtomicBool>) {
  let app = app.clone();
  std::thread::spawn(move || {
    let mut busy = false;
    while started.load(Ordering::SeqCst) {
      std::thread::sleep(Duration::from_secs(4));
      if !started.load(Ordering::SeqCst) {
        return;
      }
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
    .plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .invoke_handler(tauri::generate_handler![check_update, install_update])
    .manage(Sidecar(Mutex::new(None)))
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
        let started = Instant::now();
        while started.elapsed() < STARTUP_TIMEOUT && !exited.load(Ordering::SeqCst) {
          if healthy(port) {
            // Install a pending release first; on success the app restarts and never gets here.
            tauri::async_runtime::block_on(update_at_launch(&handle, &window));
            let url = Url::parse(&format!("http://127.0.0.1:{port}/app")).expect("a valid local URL");
            if let Err(e) = window.navigate(url) {
              log::error!("could not open the app: {e}");
            }
            watch_for_updates(handle.clone(), window.clone());
            watch_recording(&handle, exited.clone());
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
        if let Some(child) = app.state::<Sidecar>().0.lock().unwrap().take() {
          let _ = child.kill();
        }
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
