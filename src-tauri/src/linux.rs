//! Linux desktop integration. The discovery and audio wire format stay shared.
use cpal::traits::{DeviceTrait, HostTrait};
use ksni::blocking::TrayMethods;
use serde::Serialize;
use std::sync::{atomic::{AtomicBool, Ordering}, Mutex};
use tauri::{Emitter, Manager};

pub fn audio_host() -> Result<cpal::Host, String> {
    // PipeWire's PulseAudio service exposes capture sources/sinks, rather than
    // every PipeWire node and application stream. It also works on PulseAudio.
    cpal::host_from_id(cpal::HostId::PulseAudio)
        .map_err(|e| format!("PipeWire/PulseAudio unavailable: {e}"))
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
    handle: Mutex<Option<ksni::blocking::Handle<LinuxTray>>>,
    available: std::sync::Arc<AtomicBool>,
    pub enabled: AtomicBool,
    autostart: bool,
}

pub struct LinuxTray {
    app: tauri::AppHandle,
    language: String,
    available: std::sync::Arc<AtomicBool>,
}

impl LinuxTray {
    fn open(&self, settings: bool) {
        let app = self.app.clone();
        let dispatcher = app.clone();
        let _ = dispatcher.run_on_main_thread(move || {
            if let Err(error) = super::show_main_window_inner(&app, settings) {
                super::app_log(&format!("Tray activation: {error}"));
            }
        });
    }
}

impl ksni::Tray for LinuxTray {
    fn id(&self) -> String { "fr.duovoice.intercom".into() }
    fn title(&self) -> String { "DuoVoice".into() }
    fn icon_name(&self) -> String { "audio-input-microphone".into() }
    fn icon_pixmap(&self) -> Vec<ksni::Icon> {
        let image = tauri::include_image!("icons/icon.png");
        let data = image.rgba().chunks_exact(4).flat_map(|p| [p[3], p[0], p[1], p[2]]).collect();
        vec![ksni::Icon { width: image.width() as i32, height: image.height() as i32, data }]
    }
    fn activate(&mut self, _x: i32, _y: i32) { self.open(false); }
    fn watcher_online(&self) { self.available.store(true, Ordering::Relaxed); }
    fn watcher_offline(&self, _reason: ksni::OfflineReason) -> bool {
        self.available.store(false, Ordering::Relaxed);
        // Never leave the app hidden when the desktop loses its tray service.
        self.open(false);
        true
    }
    fn menu(&self) -> Vec<ksni::MenuItem<Self>> {
        use ksni::menu::StandardItem;
        let french = self.language == "fr";
        vec![
            StandardItem {
                label: if french { "Ouvrir DuoVoice" } else { "Open DuoVoice" }.into(),
                icon_name: "window-restore".into(),
                activate: Box::new(|tray: &mut Self| tray.open(false)),
                ..Default::default()
            }.into(),
            StandardItem {
                label: if french { "Paramètres" } else { "Settings" }.into(),
                icon_name: "configure".into(),
                activate: Box::new(|tray: &mut Self| tray.open(true)),
                ..Default::default()
            }.into(),
            ksni::MenuItem::Separator,
            StandardItem {
                label: if french { "Quitter" } else { "Quit" }.into(),
                icon_name: "application-exit".into(),
                activate: Box::new(|tray: &mut Self| tray.app.exit(0)),
                ..Default::default()
            }.into(),
        ]
    }
}

fn spawn(app: &tauri::AppHandle, available: std::sync::Arc<AtomicBool>, language: String)
    -> Result<ksni::blocking::Handle<LinuxTray>, String>
{
    // spawn checks the watcher; watcher_online only fires when it reappears.
    available.store(true, Ordering::Relaxed);
    match (LinuxTray { app: app.clone(), language, available: available.clone() }).spawn() {
        Ok(handle) => Ok(handle),
        Err(error) => { available.store(false, Ordering::Relaxed); Err(error.to_string()) }
    }
}

pub fn setup(app: &tauri::AppHandle, autostart: bool) {
    let available = std::sync::Arc::new(AtomicBool::new(false));
    let handle = match spawn(app, available.clone(), "fr".into()) {
        Ok(handle) => Some(handle),
        Err(error) => { super::app_log(&format!("Linux tray unavailable: {error}")); None }
    };
    let enabled = handle.is_some();
    app.manage(TrayState { handle: Mutex::new(handle), available, enabled: AtomicBool::new(enabled), autostart });
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
        if let Some(handle) = handle.as_ref() {
            handle.update(|tray| tray.language = language);
        } else {
            *handle = Some(spawn(&app, state.available.clone(), language)?);
        }
    } else if let Some(handle) = handle.take() {
        state.available.store(false, Ordering::Relaxed);
        handle.shutdown().wait();
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
