use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};

/// Toggle window visibility — used by tray and global shortcut.
fn toggle_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

/// Set the main window to ignore cursor events (click-through mode).
#[tauri::command]
fn set_click_through(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window
            .set_ignore_cursor_events(enabled)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Expose ecosystem health to the Rust side for potential native notifications.
#[tauri::command]
fn notify_health(health_pct: f64) -> String {
    if health_pct < 50.0 {
        format!("CRITICAL: ecosystem health at {:.1}%", health_pct)
    } else if health_pct < 70.0 {
        format!("WARNING: ecosystem health at {:.1}%", health_pct)
    } else {
        format!("OK: ecosystem health at {:.1}%", health_pct)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // ---- System Tray ----
            let show_i = MenuItem::with_id(app, "show", "Show / Hide", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => toggle_window(app),
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_window(tray.app_handle());
                    }
                })
                .build(app)?;

            // ---- Make the window transparent / ready ----
            if let Some(window) = app.get_webview_window("main") {
                // Start in non-click-through mode; the frontend can toggle it
                let _ = window.set_ignore_cursor_events(false);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![set_click_through, notify_health])
        .run(tauri::generate_context!())
        .expect("error while running JARVIS Companion");
}
