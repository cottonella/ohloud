use tauri_plugin_dialog::DialogExt;

// Only the Linux mic path needs `Manager` (for `get_webview_window`);
// `package_info()` resolves without it, so keep the import off other targets.
#[cfg(target_os = "linux")]
use tauri::Manager;

// Reports who the native side is. The tRPC `native` procedure invokes this over
// Tauri IPC, so `await window.trpc.native.query()` from the DevTools console
// proves the bridge end to end (it returns `{ source: 'tauri', ... }` in the
// desktop app, `{ source: 'web' }` on the website).
#[tauri::command]
fn app_info(app: tauri::AppHandle) -> serde_json::Value {
    let pkg = app.package_info();
    serde_json::json!({
        "name": pkg.name,
        "version": pkg.version.to_string(),
        "tauriVersion": tauri::VERSION,
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
    })
}

// Native "Save As" for a received file. The webview can't save files itself
// (browser downloads don't work inside a Tauri webview), so it hands the bytes
// here; we prompt with the OS dialog and write only where the user chooses.
// Returns false if the user cancels. Doing the write in Rust (rather than via
// the fs plugin) keeps the webview from ever holding broad file-write access.
#[tauri::command]
async fn save_file(app: tauri::AppHandle, name: String, contents: Vec<u8>) -> Result<bool, String> {
    // `blocking_save_file` must run off the main thread; an async command runs
    // on the async runtime, which satisfies that.
    let Some(path) = app.dialog().file().set_file_name(name).blocking_save_file() else {
        return Ok(false);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, &contents).map_err(|e| e.to_string())?;
    Ok(true)
}

// Linux: WebKitGTK denies getUserMedia by default (its built-in permission
// handler auto-denies everything), so the Receive tab's microphone stays silent
// until we flip on the media-stream settings and allow the request on wry's own
// webview. macOS relies on Info.plist; Windows uses the WebView2 flag in run().
#[cfg(target_os = "linux")]
fn enable_linux_microphone(window: &tauri::WebviewWindow) {
    use webkit2gtk::{PermissionRequestExt, SettingsExt, WebViewExt};

    let _ = window.with_webview(|webview| {
        let wv: webkit2gtk::WebView = webview.inner();
        if let Some(settings) = wv.settings() {
            settings.set_enable_media_stream(true);
            settings.set_enable_mediasource(true);
            settings.set_enable_webrtc(true);
        }
        // ohloud only ever requests the microphone, so a blanket allow is safe
        // and sidesteps the glib downcast dance for one request type.
        wv.connect_permission_request(|_wv, request| {
            request.allow();
            true
        });
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Windows/WebView2 otherwise prompts for (or denies) getUserMedia. This flag
    // auto-grants the REAL default microphone with no prompt and must be set
    // before the WebView2 environment is created. Trade-off: it is a WebView2
    // browser flag — swap in a `webview2-com` PermissionRequested handler if you
    // would rather not depend on it. (Safe in edition 2021: `set_var` is not
    // `unsafe` here, and this runs before any other thread starts.)
    #[cfg(windows)]
    std::env::set_var(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "--use-fake-ui-for-media-stream",
    );

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|_app| {
            #[cfg(target_os = "linux")]
            if let Some(window) = _app.get_webview_window("main") {
                enable_linux_microphone(&window);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![app_info, save_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
