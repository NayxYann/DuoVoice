//! Linux desktop integration. The discovery and audio wire format stay shared.
use cpal::traits::{DeviceTrait, HostTrait};
use serde::Serialize;
use std::sync::{atomic::{AtomicBool, Ordering}, Mutex};
use tauri::{menu::{Menu, MenuItem, PredefinedMenuItem}, tray::TrayIconBuilder, Manager};

pub fn audio_host() -> Result<cpal::Host, String> {
    // Use the session audio server (PipeWire-Pulse or PulseAudio). Opening ALSA
    // directly can bypass the session mixer and disrupt audio for other apps.
    cpal::host_from_id(cpal::HostId::PulseAudio)
        .map_err(|e| format!("No PulseAudio-compatible audio service available (PipeWire-Pulse or PulseAudio): {e}"))
}

#[tauri::command]
pub fn linux_desktop() -> &'static str {
    let current = std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_default().to_ascii_lowercase();
    if current.split(':').any(|name| name.contains("gnome")) {
        "gnome"
    } else if current.split(':').any(|name| name.contains("kde") || name.contains("plasma")) {
        "kde"
    } else {
        "generic"
    }
}

fn is_capture_source(id: &str) -> bool {
    !id.ends_with(".monitor")
}

#[derive(Serialize)]
pub struct Device {
    id: String,
    name: String,
}

#[derive(Serialize)]
pub struct Devices {
    inputs: Vec<Device>,
    outputs: Vec<Device>,
}

#[tauri::command]
pub fn list_linux_devices() -> Result<Devices, String> {
    let host = audio_host()?;
    let collect = |input: bool| -> Result<Vec<Device>, String> {
        let devices = if input { host.input_devices() } else { host.output_devices() }
            .map_err(|e| e.to_string())?;
        let mut result = Vec::new();
        for device in devices {
            let (Ok(id), Ok(description)) = (device.id(), device.description()) else { continue; };
            if input && !is_capture_source(id.id()) { continue; }
            let usable = if input { device.default_input_config() } else { device.default_output_config() };
            if usable.is_err() { continue; }
            let id = id.to_string();
            if !result.iter().any(|d: &Device| d.id == id) {
                result.push(Device { id, name: description.name().to_owned() });
            }
        }
        result.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()).then(a.id.cmp(&b.id)));
        Ok(result)
    };
    Ok(Devices { inputs: collect(true)?, outputs: collect(false)? })
}

pub struct TrayState {
    handle: Mutex<Option<tauri::tray::TrayIcon>>,
    menu: Mutex<Option<TrayMenu>>,
    available: std::sync::Arc<AtomicBool>,
    pub enabled: AtomicBool,
    autostart: bool,
}

struct TrayMenu {
    open: MenuItem<tauri::Wry>,
    settings: MenuItem<tauri::Wry>,
    quit: MenuItem<tauri::Wry>,
}

fn spawn(app: &tauri::AppHandle, language: &str) -> Result<(tauri::tray::TrayIcon, TrayMenu), String> {
    let french = language == "fr";
    let open = MenuItem::with_id(app, "open", if french { "Ouvrir DuoVoice" } else { "Open DuoVoice" }, true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let settings = MenuItem::with_id(app, "settings", if french { "Paramètres" } else { "Settings" }, true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let separator = PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?;
    let quit = MenuItem::with_id(app, "quit", if french { "Quitter" } else { "Quit" }, true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let menu = Menu::with_items(app, &[&open, &settings, &separator, &quit]).map_err(|e| e.to_string())?;
    let icon = app.default_window_icon().cloned()
        .ok_or_else(|| "Icône DuoVoice introuvable".to_string())?;
    let tray = TrayIconBuilder::with_id("duovoice-linux-tray")
        .icon(icon)
        .tooltip("DuoVoice")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => {
                if let Err(error) = super::show_main_window_inner(app, false) {
                    super::app_log(&format!("Tray open: {error}"));
                }
            }
            "settings" => {
                if let Err(error) = super::show_main_window_inner(app, true) {
                    super::app_log(&format!("Tray settings: {error}"));
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)
        .map_err(|e| e.to_string())?;
    Ok((tray, TrayMenu { open, settings, quit }))
}

pub fn setup(app: &tauri::AppHandle, autostart: bool) {
    let available = std::sync::Arc::new(AtomicBool::new(false));
    let (handle, menu) = match spawn(app, "fr") {
        Ok((handle, menu)) => (Some(handle), Some(menu)),
        Err(error) => {
            super::app_log(&format!("Linux tray unavailable: {error}"));
            (None, None)
        }
    };
    let enabled = handle.is_some();
    available.store(enabled, Ordering::Relaxed);
    app.manage(TrayState { handle: Mutex::new(handle), menu: Mutex::new(menu), available, enabled: AtomicBool::new(enabled), autostart });
}

pub fn can_hide(app: &tauri::AppHandle) -> bool {
    let state = app.state::<TrayState>();
    state.enabled.load(Ordering::Relaxed) && state.available.load(Ordering::Relaxed)
}

#[derive(Serialize)]
pub struct Startup {
    autostart: bool,
    tray_available: bool,
}

#[tauri::command]
pub fn linux_startup(app: tauri::AppHandle) -> Startup {
    let state = app.state::<TrayState>();
    Startup { autostart: state.autostart, tray_available: can_hide(&app) }
}

#[tauri::command]
pub fn configure_linux_tray(app: tauri::AppHandle, enabled: bool, language: String) -> Result<bool, String> {
    let state = app.state::<TrayState>();
    let mut handle = state.handle.lock().map_err(|e| e.to_string())?;
    if enabled {
        if handle.is_none() {
            let (tray, menu) = spawn(&app, &language)?;
            *handle = Some(tray);
            *state.menu.lock().map_err(|e| e.to_string())? = Some(menu);
            state.available.store(true, Ordering::Relaxed);
        } else if let Some(menu) = state.menu.lock().map_err(|e| e.to_string())?.as_ref() {
            let french = language == "fr";
            menu.open.set_text(if french { "Ouvrir DuoVoice" } else { "Open DuoVoice" }).map_err(|e| e.to_string())?;
            menu.settings.set_text(if french { "Paramètres" } else { "Settings" }).map_err(|e| e.to_string())?;
            menu.quit.set_text(if french { "Quitter" } else { "Quit" }).map_err(|e| e.to_string())?;
        }
        if let Some(tray) = handle.as_ref() { tray.set_visible(true).map_err(|e| e.to_string())?; }
    } else {
        if let Some(tray) = handle.as_ref() { tray.set_visible(false).map_err(|e| e.to_string())?; }
        super::show_main_window_inner(&app, false)?;
    }
    state.enabled.store(enabled, Ordering::Relaxed);
    Ok(can_hide(&app))
}

#[cfg(test)]
mod tests {
    use super::is_capture_source;
    #[test]
    fn excludes_monitor_sources_but_keeps_microphones_and_virtual_capture() {
        assert!(!is_capture_source("alsa_output.pci-0000_00_1f.3.analog-stereo.monitor"));
        assert!(!is_capture_source("bluez_output.12_34_56.a2dp-sink.monitor"));
        assert!(is_capture_source("alsa_input.usb.microphone"));
        assert!(is_capture_source("noise_cancelled_microphone"));
    }
}

fn autostart_file() -> Result<std::path::PathBuf, String> {
    let config = std::env::var_os("XDG_CONFIG_HOME").filter(|p| !p.is_empty())
        .map(std::path::PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|p| std::path::PathBuf::from(p).join(".config")))
        .ok_or_else(|| "Home directory unavailable".to_string())?;
    Ok(config.join("autostart").join("DuoVoice.desktop"))
}

fn desktop_exec(path: &str) -> Result<String, String> {
    if path.contains(['\n', '\r', '=']) { return Err("Unsupported launch path".into()); }
    // Two escape layers: Exec quoting, then Desktop Entry string escaping.
    let quoted: String = path.chars().flat_map(|c| match c {
        '%' => vec!['%', '%'],
        '\\' | '"' | '`' | '$' => vec!['\\', c],
        _ => vec![c],
    }).collect();
    Ok(format!("\"{}\" --autostart", quoted.replace('\\', "\\\\").replace('\t', "\\t")))
}

fn portable_launcher(executable: &std::path::Path) -> std::path::PathBuf {
    // The extracted archive must launch AppRun to set its bundled library paths.
    if let Some(bin) = executable.parent() {
        if bin.file_name().is_some_and(|p| p == "bin") {
            if let Some(usr) = bin.parent().filter(|p| p.file_name().is_some_and(|n| n == "usr")) {
                if let Some(root) = usr.parent() {
                    let launcher = root.join("AppRun");
                    if launcher.is_file() { return launcher; }
                }
            }
        }
    }
    executable.to_path_buf()
}

#[tauri::command]
pub fn linux_autostart_enabled() -> Result<bool, String> {
    match std::fs::read_to_string(autostart_file()?) {
        Ok(contents) => Ok(!contents.lines().any(|line| line == "Hidden=true")),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub fn set_linux_autostart(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let file = autostart_file()?;
    if !enabled {
        return match std::fs::remove_file(file) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.to_string()),
        };
    }
    let path = match app.env().appimage {
        Some(path) => std::path::PathBuf::from(path),
        None => portable_launcher(&std::env::current_exe().map_err(|e| e.to_string())?),
    };
    let exec = desktop_exec(path.to_str().ok_or("Launch path is not UTF-8")?)?;
    std::fs::create_dir_all(file.parent().unwrap()).map_err(|e| e.to_string())?;
    let contents = format!("[Desktop Entry]\nType=Application\nName=DuoVoice\nExec={exec}\nTerminal=false\nX-GNOME-Autostart-enabled=true\n");
    let temporary = file.with_extension("desktop.tmp");
    std::fs::write(&temporary, contents).map_err(|e| e.to_string())?;
    std::fs::rename(temporary, file).map_err(|e| e.to_string())
}

#[cfg(test)]
mod autostart_tests {
    use super::desktop_exec;
    #[test]
    fn quotes_spaces_and_escapes_desktop_field_codes_and_shell_characters() {
        assert_eq!(desktop_exec("/home/yann/My Apps/DuoVoice.AppImage").unwrap(), "\"/home/yann/My Apps/DuoVoice.AppImage\" --autostart");
        assert_eq!(desktop_exec("/home/yann/50%/$x").unwrap(), "\"/home/yann/50%%/\\\\$x\" --autostart");
        assert!(desktop_exec("/home/yann/app\nHidden=true").is_err());
    }
}
