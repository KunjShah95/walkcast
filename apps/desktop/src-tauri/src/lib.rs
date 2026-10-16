use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::{AppHandle, LogicalSize, Manager, RunEvent, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

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
  }
  let mut head = [0u8; 12];
  stream.read_exact(&mut head).is_ok() && head.ends_with(b"200")
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())
    .plugin(tauri_plugin_shell::init())
    .manage(Sidecar(Mutex::new(None)))
    .setup(|app| {
      let handle = app.handle().clone();
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
      // Wait off the main thread so the event loop keeps running.
      std::thread::spawn(move || {
        let started = Instant::now();
        while started.elapsed() < STARTUP_TIMEOUT && !exited.load(Ordering::SeqCst) {
          if healthy(port) {
            let url = Url::parse(&format!("http://127.0.0.1:{port}/app")).expect("a valid local URL");
            if let Err(e) = window.navigate(url) {
              log::error!("could not open the app: {e}");
            }
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
