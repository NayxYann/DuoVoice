// Keep the Windows console disabled for normal release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, Stream, StreamConfig, SupportedStreamConfig};
use serde::Serialize;
use std::{
    collections::HashMap,
    io,
    net::{Ipv4Addr, SocketAddr, SocketAddrV4, UdpSocket, TcpListener, TcpStream},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};
use tauri::{
    tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState},
    Emitter, Manager, State,
};
use tauri_plugin_updater::UpdaterExt;
mod audio;
#[cfg(target_os = "linux")]
mod linux;

const DISCOVERY_PORT: u16 = 39471;
const AUDIO_PORT: u16 = 39472;
const MAGIC: &[u8; 4] = b"DV01";
const PING_MAGIC: &[u8; 4] = b"DVP1";
const PONG_MAGIC: &[u8; 4] = b"DVP2";
const SAMPLE_RATE: u32 = 48_000;
const FRAME_SAMPLES: usize = 480;
const INSTANCE_PORT: u16 = 39473;

#[derive(Serialize)]
struct DeviceLists {
    inputs: Vec<String>,
    outputs: Vec<String>,
}

#[derive(Clone, Serialize)]
struct Peer {
    name: String,
    address: String,
    port: u16,
}

struct AudioState {
    // Serialize changes across windows; manual commands disarm startup automation.
    startup_connection: Mutex<bool>,
    engine: Mutex<Option<AudioEngine>>,
    close_to_tray: std::sync::atomic::AtomicBool,
    volume: Arc<std::sync::atomic::AtomicU32>,
    muted: Arc<std::sync::atomic::AtomicBool>,
    noise_enabled: Arc<std::sync::atomic::AtomicBool>,
    noise_intensity: Arc<std::sync::atomic::AtomicU32>,
    remote: Arc<Mutex<Option<SocketAddr>>>,
}

struct DiscoveredPeer {
    peer: Peer,
    last_seen: Instant,
    announced_at: Option<Instant>,
}

struct DiscoveryState {
    peers: Mutex<HashMap<String, DiscoveredPeer>>,
    local_name: Mutex<String>,
}

struct AudioEngine {
    stop: Arc<std::sync::atomic::AtomicBool>,
    input: Option<Stream>,
    output: Option<Stream>,
    network: Option<thread::JoinHandle<()>>,
    transmit: Option<thread::JoinHandle<()>>,
    metrics: Arc<audio::Metrics>,
}

impl Drop for AudioEngine {
    fn drop(&mut self) {
        self.stop.store(true, std::sync::atomic::Ordering::Relaxed);
        // Stop callbacks before destroying their queues and joining the workers.
        self.input.take();
        self.output.take();
        if let Some(worker) = self.transmit.take() {
            worker.thread().unpark();
            let _ = worker.join();
        }
        if let Some(worker) = self.network.take() { let _ = worker.join(); }
        app_log(&format!("Final audio diagnostics: {:?}", self.metrics.snapshot()));
    }
}

#[derive(Clone, Copy)]
struct Packet {
    seq: u32,
    samples: [i16; FRAME_SAMPLES],
    received_at: Instant,
}

fn device_names(input: bool) -> Vec<String> {
    let host = cpal::default_host();
    let iter = if input { host.input_devices() } else { host.output_devices() };
    iter.map(|it| it.filter_map(|d| d.description().ok().map(|desc| desc.name().to_string())).collect()).unwrap_or_default()
}

#[tauri::command]
fn list_devices() -> DeviceLists {
    DeviceLists {
        inputs: device_names(true),
        outputs: device_names(false),
    }
}

#[tauri::command]
fn list_peers(state: State<'_, Arc<DiscoveryState>>) -> Vec<Peer> {
    let now = Instant::now();
    let mut peers = state.peers.lock().unwrap();
    peers.retain(|_, p| now.duration_since(p.last_seen) < Duration::from_secs(15));
    peers.values().map(|p| p.peer.clone()).collect()
}

#[tauri::command]
fn list_startup_peers(state: State<'_, Arc<DiscoveryState>>) -> Vec<Peer> {
    state.peers.lock().unwrap().values()
        .filter(|p| p.announced_at.is_some_and(|seen| seen.elapsed() < Duration::from_secs(6)))
        .map(|p| p.peer.clone()).collect()
}

#[tauri::command]
fn cancel_startup_connection(state: State<'_, AudioState>) {
    *state.startup_connection.lock().unwrap() = false;
}

#[tauri::command]
fn get_client_name(state: State<'_, Arc<DiscoveryState>>) -> String {
    state.local_name.lock().unwrap().clone()
}

#[tauri::command]
fn set_client_name(state: State<'_, Arc<DiscoveryState>>, name: String) -> Result<String, String> {
    let cleaned = name.trim();
    if cleaned.is_empty() {
        return Err("Le nom de la machine ne peut pas être vide".into());
    }
    if cleaned.chars().count() > 32 {
        return Err("Le nom de la machine est limité à 32 caractères".into());
    }
    if cleaned.contains('|') || cleaned.chars().any(|c| c.is_control()) {
        return Err("Le nom contient un caractère non autorisé".into());
    }

    let value = cleaned.to_string();
    *state.local_name.lock().unwrap() = value.clone();
    Ok(value)
}


fn themed_tray_icon(theme: &str, color: &str) -> tauri::image::Image<'static> {
    match theme {
        "windowsxp" => tauri::include_image!("icons/tray-windowsxp.png"),
        "axolotl" => tauri::include_image!("icons/tray-axolotl.png"),
        "cherry" => tauri::include_image!("icons/tray-cherry.png"),
        "sage" => tauri::include_image!("icons/tray-sage.png"),
        "ocean" => tauri::include_image!("icons/tray-ocean.png"),
        _ => match color {
            "rose" => tauri::include_image!("icons/tray-duovoice-rose.png"),
            "bleu" => tauri::include_image!("icons/tray-duovoice-bleu.png"),
            "vert" => tauri::include_image!("icons/tray-duovoice-vert.png"),
            "jaune" => tauri::include_image!("icons/tray-duovoice-jaune.png"),
            "orange" => tauri::include_image!("icons/tray-duovoice-orange.png"),
            "cyan" => tauri::include_image!("icons/tray-duovoice-cyan.png"),
            "ardoise" => tauri::include_image!("icons/tray-duovoice-ardoise.png"),
            _ => tauri::include_image!("icons/tray-duovoice-violet.png"),
        },
    }
}

#[tauri::command]
fn set_tray_theme_icon(app: tauri::AppHandle, theme: String, color: String) -> Result<(), String> {
    let tray = app
        .tray_by_id("duovoice-main-tray")
        .ok_or_else(|| "Icône du systray introuvable".to_string())?;
    tray.set_icon(Some(themed_tray_icon(theme.trim(), color.trim())))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_tray_icon_enabled(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let tray = app
        .tray_by_id("duovoice-main-tray")
        .ok_or_else(|| "Icône du systray introuvable".to_string())?;

    tray.set_visible(enabled).map_err(|e| e.to_string())?;

    if !enabled {
        if let Some(window) = app.get_webview_window("tray") {
            let _ = window.hide();
        }
        if let Some(window) = app.get_webview_window("tray-menu") {
            let _ = window.hide();
        }
    }

    Ok(())
}

#[tauri::command]
fn set_tray_scale(app: tauri::AppHandle, scale: f64) -> Result<(), String> {
    const QUICK_WIDTH: f64 = 280.0;
    const QUICK_HEIGHT: f64 = 348.0;
    const MENU_WIDTH: f64 = 190.0;
    const MENU_HEIGHT: f64 = 198.0;
    let scale = scale.clamp(0.9, 1.2);

    if let Some(window) = app.get_webview_window("tray") {
        window
            .set_size(tauri::Size::Logical(tauri::LogicalSize::new(
                (QUICK_WIDTH * scale).round(),
                (QUICK_HEIGHT * scale).round(),
            )))
            .map_err(|e| e.to_string())?;
    }

    if let Some(window) = app.get_webview_window("tray-menu") {
        window
            .set_size(tauri::Size::Logical(tauri::LogicalSize::new(
                (MENU_WIDTH * scale).round(),
                (MENU_HEIGHT * scale).round(),
            )))
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

// All bounds, centers and sizes are in physical virtual-screen coordinates.
fn tray_popup_position(
    monitor: (i32, i32, i32, i32),
    work: (i32, i32, i32, i32),
    icon_center: (i32, i32),
    size: (i32, i32),
    scale_factor: f64,
) -> (i32, i32) {
    let (left, top, right, bottom) = work;
    let (cx, cy) = icon_center;
    let (width, height) = size;
    let edge_gap = (4.0 * scale_factor).round() as i32;
    let taskbar_gap = (3.0 * scale_factor).round() as i32;

    // Prefer a reserved work-area edge. If the taskbar auto-hides, the work
    // area can cover the entire monitor: use the edge nearest the tray icon.
    // Bottom comes first to keep the existing placement when distances tie.
    let edges = [
        (0, bottom < monitor.3, (monitor.3 - cy).abs()),
        (1, top > monitor.1, (cy - monitor.1).abs()),
        (2, left > monitor.0, (cx - monitor.0).abs()),
        (3, right < monitor.2, (monitor.2 - cx).abs()),
    ];
    let edge = edges
        .iter()
        .min_by_key(|(_, reserved, distance)| (!reserved, *distance))
        .unwrap().0;
    let (x, y) = match edge {
        1 => (cx - width / 2, top + taskbar_gap),
        2 => (left + taskbar_gap, cy - height / 2),
        3 => (right - width - taskbar_gap, cy - height / 2),
        _ => (cx - width / 2, bottom - height - taskbar_gap),
    };
    let min_x = left + if edge == 2 { taskbar_gap } else { edge_gap };
    let min_y = top + if edge == 1 { taskbar_gap } else { edge_gap };
    let max_x = right - width - if edge == 3 { taskbar_gap } else { edge_gap };
    let max_y = bottom - height - if edge == 0 { taskbar_gap } else { edge_gap };
    (x.clamp(min_x, max_x.max(min_x)), y.clamp(min_y, max_y.max(min_y)))
}

#[cfg(test)]
mod tray_position_tests {
    use super::tray_popup_position;

    #[test]
    fn all_taskbar_edges_with_both_popups_dpi_and_secondary_monitors() {
        for scale in [1.0_f64, 1.25, 1.5, 2.0] {
            for (left, top) in [(0, 0), (-2560, -1440), (1920, 240)] {
                let monitor = (left, top, left + 1920, top + 1080);
                let gap = (3.0 * scale).round() as i32;
                for (w, h) in [(280.0, 348.0), (190.0, 198.0)] {
                    for ui_scale in [0.9, 1.0, 1.2] {
                        let size = ((w * ui_scale * scale).round() as i32, (h * ui_scale * scale).round() as i32);
                        let (width, height) = size;
                        let cases = [
                            ((left, top, left + 1920, top + 1032), (left + 960, top + 1056), (left + 960 - width / 2, top + 1032 - height - gap)),
                            ((left, top + 48, left + 1920, top + 1080), (left + 960, top + 24), (left + 960 - width / 2, top + 48 + gap)),
                            ((left + 48, top, left + 1920, top + 1080), (left + 24, top + 540), (left + 48 + gap, top + 540 - height / 2)),
                            ((left, top, left + 1872, top + 1080), (left + 1896, top + 540), (left + 1872 - width - gap, top + 540 - height / 2)),
                        ];
                        for (work, icon, expected) in cases {
                            assert_eq!(tray_popup_position(monitor, work, icon, size, scale), expected);
                        }
                    }
                }
            }
        }
    }

    #[test]
    fn reserved_taskbar_edge_wins_near_a_monitor_corner() {
        assert_eq!(tray_popup_position((0, 0, 1920, 1080), (48, 0, 1920, 1080), (24, 1070), (280, 348), 1.0), (51, 728));
        assert_eq!(tray_popup_position((0, 0, 1920, 1080), (0, 0, 1920, 1032), (1910, 1056), (280, 348), 1.0), (1636, 681));
        assert_eq!(tray_popup_position((0, 0, 1920, 1080), (0, 48, 1920, 1080), (10, 24), (190, 198), 1.0), (4, 51));
        assert_eq!(tray_popup_position((0, 0, 1920, 1080), (0, 0, 1872, 1080), (1896, 10), (190, 198), 1.0), (1679, 4));
    }

    #[test]
    fn auto_hidden_taskbar_uses_the_nearest_monitor_edge() {
        let monitor = (-1920, -1080, 0, 0);
        for (icon, expected) in [
            ((-960, -1), (-1100, -351)),
            ((-960, -1079), (-1100, -1077)),
            ((-1919, -540), (-1917, -714)),
            ((-1, -540), (-283, -714)),
        ] {
            assert_eq!(tray_popup_position(monitor, monitor, icon, (280, 348), 1.0), expected);
        }
    }

    #[test]
    fn oversized_popup_does_not_panic_when_clamping() {
        assert_eq!(tray_popup_position((0, 0, 200, 200), (0, 0, 200, 152), (100, 176), (280, 348), 1.0), (4, 4));
    }
}

#[cfg(test)]
mod audio_protocol_tests {
    use super::{push_packet, read_packet, FRAME_SAMPLES, SAMPLE_RATE};
    use std::net::{Ipv4Addr, UdpSocket};
    use std::time::Duration;

    #[test]
    fn dv01_packet_round_trips_with_the_windows_wire_format() {
        let receiver = UdpSocket::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        receiver.set_read_timeout(Some(Duration::from_secs(1))).unwrap();
        let sender = UdpSocket::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let expected: [i16; FRAME_SAMPLES] = std::array::from_fn(|i| (i as i16).wrapping_mul(-97));
        let mut sequence = 0;
        push_packet(&sender, receiver.local_addr().unwrap(), &mut sequence, &expected).unwrap();

        let mut bytes = [0; 12 + FRAME_SAMPLES * 2];
        let (length, _) = receiver.recv_from(&mut bytes).unwrap();
        let packet = read_packet(&bytes[..length]).unwrap();
        assert_eq!(packet.seq, 0);
        assert_eq!(packet.samples, expected);
        assert_eq!(sequence, 1);
        assert_eq!(SAMPLE_RATE, 48_000);
    }

    #[test]
    fn dv01_rejects_truncated_or_wrong_rate_packets() {
        let mut packet = [0; 12 + FRAME_SAMPLES * 2];
        packet[..4].copy_from_slice(b"DV01");
        packet[8..10].copy_from_slice(&48_000u16.to_be_bytes());
        packet[10..12].copy_from_slice(&(FRAME_SAMPLES as u16).to_be_bytes());
        assert!(read_packet(&packet[..packet.len() - 1]).is_none());
        packet[8..10].copy_from_slice(&44_100u16.to_be_bytes());
        assert!(read_packet(&packet).is_none());
    }
}

fn position_tray_popup(
    window: &tauri::WebviewWindow,
    click: tauri::PhysicalPosition<f64>,
    rect: tauri::Rect,
    fallback_size: tauri::PhysicalSize<u32>,
) {
    let size = window.outer_size().unwrap_or(fallback_size);
    let window_scale = window.scale_factor().unwrap_or(1.0);
    let monitor = window.monitor_from_point(click.x, click.y).ok().flatten();
    let mut position = (
        click.x.round() as i32 - size.width as i32 / 2,
        click.y.round() as i32 - size.height as i32 - 3,
    );
    let mut target_size = size;
    if let Some(monitor) = monitor {
        let scale = monitor.scale_factor();
        // A hidden popup may still have the DPI of the previously used monitor.
        target_size = size.to_logical::<f64>(window_scale).to_physical::<u32>(scale);
        let icon_position = rect.position.to_physical::<i32>(scale);
        let icon_size = rect.size.to_physical::<u32>(scale);
        let work = monitor.work_area();
        let origin = monitor.position();
        let resolution = monitor.size();
        position = tray_popup_position(
            (
                origin.x, origin.y,
                origin.x + resolution.width as i32,
                origin.y + resolution.height as i32,
            ),
            (
                work.position.x, work.position.y,
                work.position.x + work.size.width as i32,
                work.position.y + work.size.height as i32,
            ),
            (
                icon_position.x + icon_size.width as i32 / 2,
                icon_position.y + icon_size.height as i32 / 2,
            ),
            (target_size.width as i32, target_size.height as i32),
            scale,
        );
    }
    let _ = window.set_position(tauri::PhysicalPosition::new(position.0, position.1));
    if target_size != size {
        // Apply the destination's physical size after moving, preserving the
        // user's logical tray scale even when Windows changes the popup's DPI.
        let _ = window.set_size(tauri::Size::Physical(target_size));
    }
}

fn start_discovery(app_state: Arc<DiscoveryState>) {
    thread::spawn(move || {
        let socket = match UdpSocket::bind((Ipv4Addr::UNSPECIFIED, DISCOVERY_PORT)) {
            Ok(s) => s,
            Err(e) => {
                app_log(&format!("Discovery bind error on UDP {DISCOVERY_PORT}: {e}"));
                return;
            }
        };
        let _ = socket.set_broadcast(true);
        let _ = socket.set_read_timeout(Some(Duration::from_millis(500)));

        let mut last_broadcast = Instant::now() - Duration::from_secs(10);
        let mut buf = [0u8; 512];

        loop {
            if last_broadcast.elapsed() >= Duration::from_secs(2) {
                let local_name = app_state.local_name.lock().unwrap().clone();
                let msg = format!("DUOVOICE|{}|{}", local_name, AUDIO_PORT);
                let _ = socket.send_to(msg.as_bytes(), SocketAddrV4::new(Ipv4Addr::BROADCAST, DISCOVERY_PORT));
                last_broadcast = Instant::now();
            }

            match socket.recv_from(&mut buf) {
                Ok((n, addr)) => {
                    if let Ok(text) = std::str::from_utf8(&buf[..n]) {
                        let parts: Vec<&str> = text.split('|').collect();
                        let local_name = app_state.local_name.lock().unwrap().clone();
                        if parts.len() == 3 && parts[0] == "DUOVOICE" && parts[1] != local_name {
                            if let Ok(port) = parts[2].parse::<u16>() {
                                let ip = addr.ip().to_string();
                                app_state.peers.lock().unwrap().insert(ip.clone(), DiscoveredPeer {
                                    peer: Peer { name: parts[1].to_string(), address: ip, port },
                                    last_seen: Instant::now(),
                                    announced_at: Some(Instant::now()),
                                });
                            }
                        }
                    }
                }
                Err(ref e) if e.kind() == io::ErrorKind::TimedOut || e.kind() == io::ErrorKind::WouldBlock => {}
                Err(e) => {
                    app_log(&format!("Discovery receive error: {e}"));
                    break;
                }
            }
        }
    });
}

#[tauri::command]
fn add_manual_peer(state: State<'_, Arc<DiscoveryState>>, address: String) -> Result<Peer, String> {
    let address = address.trim().to_string();
    let ip: Ipv4Addr = address.parse().map_err(|_| "Adresse IPv4 invalide".to_string())?;
    if ip.is_unspecified() || ip.is_multicast() || ip.is_broadcast() {
        return Err("Cette adresse IPv4 ne peut pas être utilisée".into());
    }
    let peer = Peer { name: format!("PC — {}", ip), address: ip.to_string(), port: AUDIO_PORT };
    state.peers.lock().unwrap().entry(ip.to_string()).or_insert(DiscoveredPeer {
        peer: peer.clone(), last_seen: Instant::now() + Duration::from_secs(3600), announced_at: None,
    });
    Ok(peer)
}

fn choose_device(host: &cpal::Host, name: Option<&str>, input: bool) -> Result<cpal::Device, String> {
    #[cfg(target_os = "linux")]
    if let Some(target) = name {
        let id = target.parse::<cpal::DeviceId>().map_err(|e| e.to_string())?;
        return host.device_by_id(&id).ok_or_else(|| "Périphérique audio indisponible".into());
    }

    if let Some(target) = name {
        let devices = if input { host.input_devices() } else { host.output_devices() };
        if let Ok(mut it) = devices {
            while let Some(d) = it.next() {
                let device_name = d.description().ok().map(|desc| desc.name().to_string());
                if device_name.as_deref() == Some(target) {
                    return Ok(d);
                }
            }
        }
    }
    if input { host.default_input_device() } else { host.default_output_device() }
        .ok_or_else(|| "Périphérique audio introuvable".into())
}

fn choose_stream_config(device: &cpal::Device, input: bool) -> Result<SupportedStreamConfig, String> {
    let default = if input {
        device.default_input_config()
    } else {
        device.default_output_config()
    }.map_err(|e| e.to_string())?;

    // Keep DuoVoice's internal transport at 48 kHz while explicitly selecting
    // a format that our callbacks support. This avoids relying on CPAL's
    // default-format priority, which changed in CPAL 0.18.2 on Windows.
    let preferred = [default.sample_format(), SampleFormat::F32, SampleFormat::I16, SampleFormat::U16];
    for format in preferred {
        if input {
            if let Ok(configs) = device.supported_input_configs() {
                for range in configs {
                    if range.sample_format() == format
                        && range.min_sample_rate() <= SAMPLE_RATE
                        && range.max_sample_rate() >= SAMPLE_RATE
                    {
                        return Ok(range.with_sample_rate(SAMPLE_RATE));
                    }
                }
            }
        } else if let Ok(configs) = device.supported_output_configs() {
            for range in configs {
                if range.sample_format() == format
                    && range.min_sample_rate() <= SAMPLE_RATE
                    && range.max_sample_rate() >= SAMPLE_RATE
                {
                    return Ok(range.with_sample_rate(SAMPLE_RATE));
                }
            }
        }
    }

    Err(format!(
        "Aucun format audio compatible en 48 kHz pour ce périphérique (format par défaut: {:?})",
        default.sample_format()
    ))
}

fn push_packet(socket: &UdpSocket, remote: SocketAddr, seq: &mut u32, samples: &[i16; FRAME_SAMPLES]) -> io::Result<()> {
    let mut data = [0u8; 12 + FRAME_SAMPLES * 2];
    data[..4].copy_from_slice(MAGIC);
    data[4..8].copy_from_slice(&seq.to_be_bytes());
    data[8..10].copy_from_slice(&(SAMPLE_RATE as u16).to_be_bytes());
    data[10..12].copy_from_slice(&(FRAME_SAMPLES as u16).to_be_bytes());
    for (bytes, sample) in data[12..].chunks_exact_mut(2).zip(samples) {
        bytes.copy_from_slice(&sample.to_le_bytes());
    }
    *seq = seq.wrapping_add(1);
    socket.send_to(&data, remote).map(|_| ())
}

fn read_packet(buf: &[u8]) -> Option<Packet> {
    if buf.len() < 12 || &buf[..4] != MAGIC { return None; }
    let seq = u32::from_be_bytes(buf[4..8].try_into().ok()?);
    let sample_rate = u16::from_be_bytes(buf[8..10].try_into().ok()?) as u32;
    let count = u16::from_be_bytes(buf[10..12].try_into().ok()?) as usize;
    if sample_rate != SAMPLE_RATE || count != FRAME_SAMPLES || buf.len() < 12 + count * 2 { return None; }
    let mut samples = [0; FRAME_SAMPLES];
    for (sample, bytes) in samples.iter_mut().zip(buf[12..12 + count * 2].chunks_exact(2)) {
        *sample = i16::from_le_bytes([bytes[0], bytes[1]]);
    }
    Some(Packet { seq, samples, received_at: Instant::now() })
}

fn denoise_frame(
    denoiser: &mut Option<Box<nnnoiseless::DenoiseState<'static>>>,
    delayed_dry: &mut Option<[i16; FRAME_SAMPLES]>,
    input: &[i16],
    intensity: f32,
    output: &mut [i16],
) {
    let strength = intensity.clamp(0.0, 1.0);
    if denoiser.is_none() {
        *denoiser = Some(nnnoiseless::DenoiseState::new());
    }

    let Some(d) = denoiser.as_mut() else {
        output.copy_from_slice(input);
        return;
    };

    // RNNoise is …4677 tokens truncated…

    let endpoint = format!(
        "https://github.com/NayxYann/DuoVoice/releases/download/v{cleaned}/latest.json"
    )
    .parse()
    .map_err(|e| format!("URL de version invalide : {e}"))?;

    let updater = app
        .updater_builder()
        .endpoints(vec![endpoint])
        .map_err(|e| format!("Configuration updater : {e}"))?
        .version_comparator(|current, release| release.version != current)
        .restart_after_install(true)
        .build()
        .map_err(|e| format!("Initialisation updater : {e}"))?;

    let update = updater
        .check()
        .await
        .map_err(|e| format!("Recherche de v{cleaned} : {e}"))?
        .ok_or_else(|| format!("La release v{cleaned} ne fournit pas de mise à jour compatible"))?;

    let found = update.version.clone();
    if found.trim_start_matches('v') != cleaned {
        return Err(format!(
            "La release demandée est v{cleaned}, mais son manifeste annonce v{found}"
        ));
    }

    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| format!("Installation de v{cleaned} : {e}"))?;

    Ok(found.trim_start_matches('v').to_string())
}

#[tauri::command]
fn hide_window_to_tray(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Fenêtre principale introuvable".to_string())?;
    window.set_skip_taskbar(true).map_err(|e| e.to_string())?;
    window.hide().map_err(|e| e.to_string())
}

fn acquire_single_instance() -> Option<TcpListener> {
    match TcpListener::bind((Ipv4Addr::LOCALHOST, INSTANCE_PORT)) {
        Ok(listener) => Some(listener),
        Err(_) => {
            if let Ok(mut stream) = TcpStream::connect((Ipv4Addr::LOCALHOST, INSTANCE_PORT)) {
                use std::io::Write;
                let _ = stream.write_all(b"FOCUS");
            }
            None
        }
    }
}

#[cfg(all(feature = "linux-edition", not(target_os = "linux")))]
compile_error!("the linux-edition feature can only be built for Linux");

fn main() {
    #[cfg(feature = "linux-edition")]
    run_linux();

    #[cfg(not(feature = "linux-edition"))]
    run_windows();
}

fn run_windows() {
    app_log("=== DuoVoice starting ===");
    let Some(instance_listener) = acquire_single_instance() else {
        app_log("Another DuoVoice instance is already running; requesting focus and exiting.");
        return;
    };
    let launched_from_autostart = std::env::args().any(|arg| arg == "--autostart");
    app_log(&format!("autostart={launched_from_autostart}"));

    let result = tauri::Builder::default()
        .manage(AudioState {
            startup_connection: Mutex::new(true),
            engine: Mutex::new(None),
            close_to_tray: std::sync::atomic::AtomicBool::new(true),
            volume: Arc::new(std::sync::atomic::AtomicU32::new(1.0f32.to_bits())),
            muted: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            noise_enabled: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            noise_intensity: Arc::new(std::sync::atomic::AtomicU32::new(0.65f32.to_bits())),
            remote: Arc::new(Mutex::new(None)),
        })
        .manage(Arc::new(DiscoveryState {
            peers: Mutex::new(HashMap::new()),
            local_name: Mutex::new(
                hostname::get().ok()
                    .and_then(|h| h.into_string().ok())
                    .filter(|name| !name.trim().is_empty())
                    .unwrap_or_else(|| "DuoVoice".into())
            ),
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .invoke_handler(tauri::generate_handler![
            list_devices, list_peers, list_startup_peers, cancel_startup_connection, add_manual_peer, get_client_name, set_client_name, set_tray_icon_enabled, set_tray_theme_icon, set_tray_scale, start_audio, stop_audio, audio_status, set_volume, set_mute, toggle_mute, measure_latency, set_noise_reduction, set_close_action, show_main_window, quit_app, open_project_github, install_version, hide_window_to_tray, log_client_error
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "tray" || window.label() == "tray-menu" {
                    api.prevent_close();
                    let _ = window.hide();
                    return;
                }
                let to_tray = window.state::<AudioState>().close_to_tray.load(std::sync::atomic::Ordering::Relaxed);
                if to_tray {
                    api.prevent_close();
                    let _ = window.set_skip_taskbar(true);
                    let _ = window.hide();
                } else {
                    window.app_handle().exit(0);
                }
            }
            if let tauri::WindowEvent::Focused(false) = event {
                if window.label() == "tray" || window.label() == "tray-menu" {
                    let _ = window.hide();
                }
            }
        })
        .setup(move |app| {
            app_log("Tauri setup entered");
            let discovery = app.state::<Arc<DiscoveryState>>().inner().clone();
            start_discovery(discovery);

            let focus_app = app.handle().clone();
            thread::spawn(move || {
                for stream in instance_listener.incoming() {
                    if stream.is_ok() {
                        if let Err(e) = show_main_window_inner(&focus_app, false) {
                            app_log(&format!("Single-instance focus error: {e}"));
                        }
                    }
                }
            });

            // The right-click menu is rendered by DuoVoice itself instead of the
            // native Windows menu so it can share the same spacing, colors and
            // interaction language as the rest of the application.
            let icon = app.default_window_icon().cloned()
                .ok_or_else(|| tauri::Error::AssetNotFound("DuoVoice tray icon".into()))?;

            let _tray = TrayIconBuilder::with_id("duovoice-main-tray")
                .icon(icon)
                .tooltip("DuoVoice")
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button, button_state: MouseButtonState::Up, position, rect, .. } = event {
                        let app = tray.app_handle();

                        match button {
                            MouseButton::Left => {
                                if let Some(menu) = app.get_webview_window("tray-menu") {
                                    let _ = menu.hide();
                                }
                                if let Some(w) = app.get_webview_window("tray") {
                                    if w.is_visible().unwrap_or(false) {
                                        let _ = w.hide();
                                        return;
                                    }

                                    position_tray_popup(&w, position, rect, tauri::PhysicalSize::new(280, 348));
                                    let _ = w.show();
                                    let _ = w.set_focus();
                                }
                            }
                            MouseButton::Right => {
                                if let Some(quick) = app.get_webview_window("tray") {
                                    let _ = quick.hide();
                                }
                                if let Some(w) = app.get_webview_window("tray-menu") {
                                    position_tray_popup(&w, position, rect, tauri::PhysicalSize::new(190, 198));
                                    let _ = w.show();
                                    let _ = w.set_focus();
                                }
                            }
                            _ => {}
                        }
                    }
                })
                .build(app)?;

            if let Some(w) = app.get_webview_window("tray") {
                let _ = w.hide();
                let _ = w.set_skip_taskbar(true);
            }
            if let Some(w) = app.get_webview_window("tray-menu") {
                let _ = w.hide();
                let _ = w.set_skip_taskbar(true);
            }


            app_log("Tauri setup completed");
            Ok(())
        })
        .run(tauri::generate_context!());

    match result {
        Ok(()) => app_log("DuoVoice exited normally"),
        Err(e) => app_log(&format!("DuoVoice startup error: {e}")),
    }
}

/// Linux gets its own app entry point and window configuration. The existing
/// Windows entry point and audio engine remain the path used by Windows builds.
#[cfg(target_os = "linux")]
pub fn run_linux() {
    app_log("=== DuoVoice Linux starting ===");
    let Some(instance_listener) = acquire_single_instance() else {
        app_log("Another DuoVoice instance is already running; requesting focus and exiting.");
        return;
    };
    let launched_from_autostart = std::env::args().any(|arg| arg == "--autostart");

    let result = tauri::Builder::default()
        .manage(AudioState {
            startup_connection: Mutex::new(false),
            engine: Mutex::new(None),
            close_to_tray: std::sync::atomic::AtomicBool::new(false),
            volume: Arc::new(std::sync::atomic::AtomicU32::new(1.0f32.to_bits())),
            muted: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            noise_enabled: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            noise_intensity: Arc::new(std::sync::atomic::AtomicU32::new(0.65f32.to_bits())),
            remote: Arc::new(Mutex::new(None)),
        })
        .manage(Arc::new(DiscoveryState {
            peers: Mutex::new(HashMap::new()),
            local_name: Mutex::new(
                hostname::get().ok()
                    .and_then(|h| h.into_string().ok())
                    .filter(|name| !name.trim().is_empty())
                    .unwrap_or_else(|| "DuoVoice".into())
            ),
        }))
        .invoke_handler(tauri::generate_handler![
            linux::list_linux_devices,
            linux::linux_desktop,
            linux::linux_startup,
            linux::configure_linux_tray,
            linux::linux_autostart_enabled,
            linux::set_linux_autostart,
            list_peers,
            add_manual_peer,
            get_client_name,
            set_client_name,
            start_audio,
            stop_audio,
            audio_status,
            set_volume,
            set_mute,
            toggle_mute,
            measure_latency,
            set_noise_reduction,
            set_close_action,
            show_main_window,
            quit_app,
            open_project_github,
            hide_window_to_tray,
            log_client_error
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let to_tray = window.state::<AudioState>().close_to_tray.load(std::sync::atomic::Ordering::Relaxed)
                    && linux::can_hide(app);
                if to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    app.exit(0);
                }
            }
        })
        .setup(move |app| {
            let discovery = app.state::<Arc<DiscoveryState>>().inner().clone();
            start_discovery(discovery);

            let focus_app = app.handle().clone();
            thread::spawn(move || {
                for stream in instance_listener.incoming() {
                    if stream.is_ok() {
                        if let Err(error) = show_main_window_inner(&focus_app, false) {
                            app_log(&format!("Single-instance focus error: {error}"));
                        }
                    }
                }
            });

            linux::setup(app.handle(), launched_from_autostart);
            let tray_available = linux::can_hide(app.handle());
            app.state::<AudioState>().close_to_tray.store(tray_available, std::sync::atomic::Ordering::Relaxed);
            app_log("DuoVoice Linux setup completed");
            Ok(())
        })
        .run(tauri::generate_context!());

    match result {
        Ok(()) => app_log("DuoVoice Linux exited normally"),
        Err(error) => app_log(&format!("DuoVoice Linux startup error: {error}")),
    }
}
