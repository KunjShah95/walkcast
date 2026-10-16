use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, RunEvent, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// The app server the window talks to. In a release build it is the bundled Node running
/// `sidecar.ts` on a free loopback port; `tauri dev` uses the server `npm run ui` already started.
struct Sidecar(Mutex<Option<CommandChild>>);

const DEV_URL: &str = "http://127.0.0.1:4320/app";
const STARTUP_TIMEOUT: Duration = Duration::from_secs(60);

fn free_port() -> std::io::Result<u16> {
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

fn open_window(app: &AppHandle, url: &str) -> tauri::Result<()> {
  let url = Url::parse(url).expect("a valid local URL");
  WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
    .title("Walkcast")
    .inner_size(1280.0, 820.0)
    .resizable(true)
    .build()?;
  Ok(())
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

fn start_sidecar(app: &AppHandle) -> Result<u16, Box<dyn std::error::Error>> {
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
        CommandEvent::Terminated(status) => log::error!("sidecar exited: {:?}", status.code),
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
        open_window(&handle, DEV_URL)?;
        return Ok(());
      }
      let port = start_sidecar(&handle)?;
      // Wait off the main thread so the event loop keeps running; open the window once it answers.
      std::thread::spawn(move || {
        let started = Instant::now();
        while started.elapsed() < STARTUP_TIMEOUT {
          if healthy(port) {
            if let Err(e) = open_window(&handle, &format!("http://127.0.0.1:{port}/app")) {
              log::error!("could not open the window: {e}");
              handle.exit(1);
            }
            return;
          }
          std::thread::sleep(Duration::from_millis(200));
        }
        log::error!("the app server did not start within {}s", STARTUP_TIMEOUT.as_secs());
        handle.exit(1);
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
