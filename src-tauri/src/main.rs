// Keep the Windows console disabled for normal release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, Stream, StreamConfig};
use serde::Serialize;
use std::{
    collections::{HashMap, VecDeque},
    io,
    net::{Ipv4Addr, SocketAddr, SocketAddrV4, UdpSocket},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState},
    Emitter, Manager, State,
};

const DISCOVERY_PORT: u16 = 39471;
const AUDIO_PORT: u16 = 39472;
const MAGIC: &[u8; 4] = b"DV01";
const PING_MAGIC: &[u8; 4] = b"DVP1";
const PONG_MAGIC: &[u8; 4] = b"DVP2";
const SAMPLE_RATE: u32 = 48_000;
const FRAME_SAMPLES: usize = 480;

#[derive(Clone, Serialize)]
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
    engine: Mutex<Option<AudioEngine>>,
    close_to_tray: std::sync::atomic::AtomicBool,
    volume: Arc<Mutex<f32>>,
    muted: Arc<std::sync::atomic::AtomicBool>,
    noise_enabled: Arc<std::sync::atomic::AtomicBool>,
    noise_intensity: Arc<Mutex<f32>>,
    remote: Arc<Mutex<Option<SocketAddr>>>,
}

#[derive(Clone)]
struct DiscoveredPeer {
    peer: Peer,
    last_seen: Instant,
}

struct DiscoveryState {
    peers: Mutex<HashMap<String, DiscoveredPeer>>,
}

struct AudioEngine {
    stop: Arc<std::sync::atomic::AtomicBool>,
    volume: Arc<Mutex<f32>>,
    muted: Arc<std::sync::atomic::AtomicBool>,
    _input: Stream,
    _output: Stream,
    _network: thread::JoinHandle<()>,
}

#[derive(Clone)]
struct Packet {
    seq: u32,
    samples: Vec<i16>,
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

fn start_discovery(app_state: Arc<DiscoveryState>) {
    thread::spawn(move || {
        let hostname = hostname::get().ok()
            .and_then(|h| h.into_string().ok())
            .unwrap_or_else(|| "DuoVoice".into());

        let socket = match UdpSocket::bind((Ipv4Addr::UNSPECIFIED, DISCOVERY_PORT)) {
            Ok(s) => s,
            Err(_) => return,
        };
        let _ = socket.set_broadcast(true);
        let _ = socket.set_read_timeout(Some(Duration::from_millis(500)));

        let mut last_broadcast = Instant::now() - Duration::from_secs(10);
        let mut buf = [0u8; 512];

        loop {
            if last_broadcast.elapsed() >= Duration::from_secs(2) {
                let msg = format!("DUOVOICE|{}|{}", hostname, AUDIO_PORT);
                let _ = socket.send_to(msg.as_bytes(), SocketAddrV4::new(Ipv4Addr::BROADCAST, DISCOVERY_PORT));
                last_broadcast = Instant::now();
            }

            match socket.recv_from(&mut buf) {
                Ok((n, addr)) => {
                    if let Ok(text) = std::str::from_utf8(&buf[..n]) {
                        let parts: Vec<&str> = text.split('|').collect();
                        if parts.len() == 3 && parts[0] == "DUOVOICE" && parts[1] != hostname {
                            if let Ok(port) = parts[2].parse::<u16>() {
                                let ip = addr.ip().to_string();
                                app_state.peers.lock().unwrap().insert(ip.clone(), DiscoveredPeer {
                                    peer: Peer { name: parts[1].to_string(), address: ip, port },
                                    last_seen: Instant::now(),
                                });
                            }
                        }
                    }
                }
                Err(ref e) if e.kind() == io::ErrorKind::TimedOut || e.kind() == io::ErrorKind::WouldBlock => {}
                Err(_) => break,
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
    state.peers.lock().unwrap().insert(ip.to_string(), DiscoveredPeer { peer: peer.clone(), last_seen: Instant::now() + Duration::from_secs(3600) });
    Ok(peer)
}

fn choose_device(host: &cpal::Host, name: Option<&str>, input: bool) -> Result<cpal::Device, String> {
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

fn push_packet(socket: &UdpSocket, remote: SocketAddr, seq: &mut u32, samples: &[i16]) {
    let mut data = Vec::with_capacity(12 + samples.len() * 2);
    data.extend_from_slice(MAGIC);
    data.extend_from_slice(&seq.to_be_bytes());
    data.extend_from_slice(&(SAMPLE_RATE as u16).to_be_bytes());
    data.extend_from_slice(&(samples.len() as u16).to_be_bytes());
    for s in samples {
        data.extend_from_slice(&s.to_le_bytes());
    }
    let _ = socket.send_to(&data, remote);
    *seq = seq.wrapping_add(1);
}

fn read_packet(buf: &[u8]) -> Option<Packet> {
    if buf.len() < 12 || &buf[..4] != MAGIC { return None; }
    let seq = u32::from_be_bytes(buf[4..8].try_into().ok()?);
    let count = u16::from_be_bytes(buf[10..12].try_into().ok()?) as usize;
    if buf.len() < 12 + count * 2 { return None; }
    let mut samples = Vec::with_capacity(count);
    for chunk in buf[12..12 + count * 2].chunks_exact(2) {
        samples.push(i16::from_le_bytes([chunk[0], chunk[1]]));
    }
    Some(Packet { seq, samples })
}

fn denoise_frame(denoiser: &mut Option<rnnoise2::Denoiser>, input: &[i16], intensity: f32, output: &mut [i16]) {
    let strength = intensity.clamp(0.0, 1.0);
    if strength <= 0.001 {
        output.copy_from_slice(input);
        return;
    }
    if denoiser.is_none() {
        *denoiser = rnnoise2::Denoiser::new(None);
    }
    let Some(d) = denoiser.as_mut() else {
        output.copy_from_slice(input);
        return;
    };
    let mut in_f = [0.0f32; FRAME_SAMPLES];
    let mut out_f = [0.0f32; FRAME_SAMPLES];
    for i in 0..FRAME_SAMPLES {
        in_f[i] = input[i] as f32 / 32768.0;
    }
    d.process(&in_f, &mut out_f);
    for i in 0..FRAME_SAMPLES {
        let dry = in_f[i];
        let wet = out_f[i].clamp(-1.0, 1.0);
        output[i] = ((dry + (wet - dry) * strength) * 32767.0)
            .round()
            .clamp(-32768.0, 32767.0) as i16;
    }
}

#[tauri::command]
fn start_audio(
    state: State<'_, AudioState>,
    remote: String,
    input: Option<String>,
    output: Option<String>,
) -> Result<(), String> {
    stop_audio_inner(&state)?;
    let host = cpal::default_host();
    let input_device = choose_device(&host, input.as_deref(), true)?;
    let output_device = choose_device(&host, output.as_deref(), false)?;
    let in_cfg = input_device.default_input_config().map_err(|e| e.to_string())?;
    let out_cfg = output_device.default_output_config().map_err(|e| e.to_string())?;
    let in_rate = in_cfg.sample_rate();
    let out_rate = out_cfg.sample_rate();
    if in_rate != SAMPLE_RATE || out_rate != SAMPLE_RATE {
        return Err(format!("Pour cette V1, les périphériques doivent être en 48 kHz (entrée {} Hz / sortie {} Hz).", in_rate, out_rate));
    }

    let remote_addr: SocketAddr = format!("{}:{}", remote, AUDIO_PORT).parse().map_err(|e| format!("Adresse distante invalide: {e}"))?;
    *state.remote.lock().unwrap() = Some(remote_addr);
    let tx = UdpSocket::bind(("0.0.0.0", 0)).map_err(|e| e.to_string())?;
    tx.set_nonblocking(true).ok();
    let rx = UdpSocket::bind(("0.0.0.0", AUDIO_PORT)).map_err(|e| format!("Port audio {} indisponible: {}", AUDIO_PORT, e))?;
    rx.set_nonblocking(true).ok();

    let stop = Arc::new(std::sync::atomic::AtomicBool::new(false));
    // Keep volume/mute state alive even while disconnected so the controls
    // remain functional and the chosen values are reused on the next call.
    let volume = Arc::clone(&state.volume);
    let muted = Arc::clone(&state.muted);
    let noise_enabled = Arc::clone(&state.noise_enabled);
    let noise_intensity = Arc::clone(&state.noise_intensity);

    let input_samples = Arc::new(Mutex::new(Vec::<i16>::with_capacity(FRAME_SAMPLES * 2)));
    let tx_buf = Arc::clone(&input_samples);
    let tx_socket = tx.try_clone().map_err(|e| e.to_string())?;
    let muted_in = Arc::clone(&muted);
    let mut seq = 0u32;

    let input_config: StreamConfig = in_cfg.clone().into();
    let input_channels = input_config.channels as usize;
    let input_stream = match in_cfg.sample_format() {
        SampleFormat::F32 => {
            let mut denoiser = None;
            let noise_enabled = Arc::clone(&noise_enabled);
            let noise_intensity = Arc::clone(&noise_intensity);
            input_device.build_input_stream(input_config, move |data: &[f32], _| {
                if muted_in.load(std::sync::atomic::Ordering::Relaxed) { return; }
                let mut b = tx_buf.lock().unwrap();
                for frame in data.chunks(input_channels.max(1)) {
                    let avg = frame.iter().copied().sum::<f32>() / frame.len().max(1) as f32;
                    b.push((avg.clamp(-1.0, 1.0) * 32767.0) as i16);
                }
                while b.len() >= FRAME_SAMPLES {
                    let mut processed = [0i16; FRAME_SAMPLES];
                    if noise_enabled.load(std::sync::atomic::Ordering::Relaxed) {
                        let intensity = *noise_intensity.lock().unwrap();
                        denoise_frame(&mut denoiser, &b[..FRAME_SAMPLES], intensity, &mut processed);
                    } else {
                        processed.copy_from_slice(&b[..FRAME_SAMPLES]);
                    }
                    push_packet(&tx_socket, remote_addr, &mut seq, &processed);
                    b.drain(..FRAME_SAMPLES);
                }
            }, |_| {}, None)
        },
        SampleFormat::I16 => {
            let mut denoiser = None;
            let noise_enabled = Arc::clone(&noise_enabled);
            let noise_intensity = Arc::clone(&noise_intensity);
            input_device.build_input_stream(input_config, move |data: &[i16], _| {
                if muted_in.load(std::sync::atomic::Ordering::Relaxed) { return; }
                let mut b = tx_buf.lock().unwrap();
                for frame in data.chunks(input_channels.max(1)) {
                    let avg = frame.iter().map(|&x| x as i32).sum::<i32>() / frame.len().max(1) as i32;
                    b.push(avg.clamp(-32768, 32767) as i16);
                }
                while b.len() >= FRAME_SAMPLES {
                    let mut processed = [0i16; FRAME_SAMPLES];
                    if noise_enabled.load(std::sync::atomic::Ordering::Relaxed) {
                        let intensity = *noise_intensity.lock().unwrap();
                        denoise_frame(&mut denoiser, &b[..FRAME_SAMPLES], intensity, &mut processed);
                    } else {
                        processed.copy_from_slice(&b[..FRAME_SAMPLES]);
                    }
                    push_packet(&tx_socket, remote_addr, &mut seq, &processed);
                    b.drain(..FRAME_SAMPLES);
                }
            }, |_| {}, None)
        },
        SampleFormat::U16 => {
            let mut denoiser = None;
            let noise_enabled = Arc::clone(&noise_enabled);
            let noise_intensity = Arc::clone(&noise_intensity);
            input_device.build_input_stream(input_config, move |data: &[u16], _| {
                if muted_in.load(std::sync::atomic::Ordering::Relaxed) { return; }
                let mut b = tx_buf.lock().unwrap();
                for frame in data.chunks(input_channels.max(1)) {
                    let avg = frame.iter().map(|&x| x as i32 - 32768).sum::<i32>() / frame.len().max(1) as i32;
                    b.push(avg.clamp(-32768, 32767) as i16);
                }
                while b.len() >= FRAME_SAMPLES {
                    let mut processed = [0i16; FRAME_SAMPLES];
                    if noise_enabled.load(std::sync::atomic::Ordering::Relaxed) {
                        let intensity = *noise_intensity.lock().unwrap();
                        denoise_frame(&mut denoiser, &b[..FRAME_SAMPLES], intensity, &mut processed);
                    } else {
                        processed.copy_from_slice(&b[..FRAME_SAMPLES]);
                    }
                    push_packet(&tx_socket, remote_addr, &mut seq, &processed);
                    b.drain(..FRAME_SAMPLES);
                }
            }, |_| {}, None)
        },
        _ => return Err("Format audio non pris en charge".into()),
    }.map_err(|e| format!("Ouverture du micro impossible: {e}"))?;

    let output_config: StreamConfig = out_cfg.clone().into();
    let output_channels = output_config.channels as usize;
    let rx_queue = Arc::new(Mutex::new(VecDeque::<i16>::with_capacity(FRAME_SAMPLES * 40)));
    let rx_queue_net = Arc::clone(&rx_queue);
    let stop_net = Arc::clone(&stop);
    let network = thread::spawn(move || {
        let mut buf = [0u8; 4096];
        let mut last_seq: Option<u32> = None;
        while !stop_net.load(std::sync::atomic::Ordering::Relaxed) {
            match rx.recv_from(&mut buf) {
                Ok((n, sender)) => {
                    if n >= 12 && &buf[..4] == PING_MAGIC {
                        let mut pong = Vec::with_capacity(12);
                        pong.extend_from_slice(PONG_MAGIC);
                        pong.extend_from_slice(&buf[4..n.min(12)]);
                        let _ = rx.send_to(&pong, sender);
                        continue;
                    }
                    if let Some(packet) = read_packet(&buf[..n]) {
                        if let Some(prev) = last_seq {
                            let delta = packet.seq.wrapping_sub(prev);
                            if delta == 0 || delta > u32::MAX / 2 { continue; }
                        }
                        last_seq = Some(packet.seq);
                        if let Ok(mut q) = rx_queue_net.try_lock() {
                            q.extend(packet.samples);
                            let max_samples = FRAME_SAMPLES * 40;
                            while q.len() > max_samples { q.pop_front(); }
                        }
                    }
                }
                Err(ref e) if e.kind() == io::ErrorKind::WouldBlock => thread::sleep(Duration::from_millis(1)),
                Err(_) => break,
            }
        }
    });

    let output_volume = Arc::clone(&volume);
    let output_stop = Arc::clone(&stop);
    let output_stream = match out_cfg.sample_format() {
        SampleFormat::F32 => {
            let q = Arc::clone(&rx_queue);
            let mut ready = false;
            output_device.build_output_stream(output_config, move |data: &mut [f32], _| {
                let vol = *output_volume.lock().unwrap();
                if let Ok(mut queue) = q.try_lock() {
                    if !ready && queue.len() >= FRAME_SAMPLES * 4 { ready = true; }
                    for frame in data.chunks_mut(output_channels.max(1)) {
                        let sample = if ready { queue.pop_front().unwrap_or(0) } else { 0 };
                        let value = sample as f32 / 32768.0 * vol;
                        for s in frame { *s = value; }
                    }
                } else {
                    for s in data.iter_mut() { *s = 0.0; }
                }
                if output_stop.load(std::sync::atomic::Ordering::Relaxed) { for s in data.iter_mut() { *s = 0.0; } }
            }, |_| {}, None)
        },
        SampleFormat::I16 => {
            let q = Arc::clone(&rx_queue);
            let mut ready = false;
            output_device.build_output_stream(output_config, move |data: &mut [i16], _| {
                let vol = *output_volume.lock().unwrap();
                if let Ok(mut queue) = q.try_lock() {
                    if !ready && queue.len() >= FRAME_SAMPLES * 4 { ready = true; }
                    for frame in data.chunks_mut(output_channels.max(1)) {
                        let sample = if ready { queue.pop_front().unwrap_or(0) } else { 0 };
                        let value = (sample as f32 * vol).clamp(-32768.0, 32767.0) as i16;
                        for s in frame { *s = value; }
                    }
                } else {
                    for s in data.iter_mut() { *s = 0; }
                }
            }, |_| {}, None)
        },
        SampleFormat::U16 => {
            let q = Arc::clone(&rx_queue);
            let mut ready = false;
            output_device.build_output_stream(output_config, move |data: &mut [u16], _| {
                let vol = *output_volume.lock().unwrap();
                if let Ok(mut queue) = q.try_lock() {
                    if !ready && queue.len() >= FRAME_SAMPLES * 4 { ready = true; }
                    for frame in data.chunks_mut(output_channels.max(1)) {
                        let sample = if ready { queue.pop_front().unwrap_or(0) } else { 0 };
                        let value = (sample as f32 * vol + 32768.0).clamp(0.0, 65535.0) as u16;
                        for s in frame { *s = value; }
                    }
                } else {
                    for s in data.iter_mut() { *s = 32768; }
                }
            }, |_| {}, None)
        },
        _ => return Err("Format de sortie non pris en charge".into()),
    }.map_err(|e| format!("Ouverture de la sortie impossible: {e}"))?;

    input_stream.play().map_err(|e| e.to_string())?;
    output_stream.play().map_err(|e| e.to_string())?;

    *state.engine.lock().unwrap() = Some(AudioEngine { stop, volume, muted, _input: input_stream, _output: output_stream, _network: network });
    Ok(())
}

fn stop_audio_inner(state: &State<'_, AudioState>) -> Result<(), String> {
    *state.remote.lock().unwrap() = None;
    if let Some(engine) = state.engine.lock().unwrap().take() {
        engine.stop.store(true, std::sync::atomic::Ordering::Relaxed);
        let _ = engine._network.join();
    }
    Ok(())
}


#[tauri::command]
fn measure_latency(state: State<'_, AudioState>) -> Result<f64, String> {
    let remote = *state.remote.lock().unwrap()
        .as_ref()
        .ok_or_else(|| "Aucune connexion active".to_string())?;

    let socket = UdpSocket::bind(("0.0.0.0", 0))
        .map_err(|e| format!("Sonde latence impossible: {e}"))?;
    socket.set_read_timeout(Some(Duration::from_millis(400)))
        .map_err(|e| e.to_string())?;

    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or_else(|_| Instant::now().elapsed().as_nanos() as u64)
        ^ std::process::id() as u64;
    let nonce_bytes = nonce.to_be_bytes();
    let mut ping = Vec::with_capacity(12);
    ping.extend_from_slice(PING_MAGIC);
    ping.extend_from_slice(&nonce_bytes);

    let started = Instant::now();
    socket.send_to(&ping, remote)
        .map_err(|e| format!("Envoi sonde impossible: {e}"))?;

    let mut buf = [0u8; 64];
    loop {
        match socket.recv_from(&mut buf) {
            Ok((n, _)) if n >= 12 && &buf[..4] == PONG_MAGIC && &buf[4..12] == nonce_bytes => {
                return Ok(started.elapsed().as_secs_f64() * 1000.0);
            }
            Ok(_) => continue,
            Err(ref e) if e.kind() == io::ErrorKind::WouldBlock || e.kind() == io::ErrorKind::TimedOut => {
                return Err("Mesure de latence expirée".into());
            }
            Err(e) => return Err(e.to_string()),
        }
    }
}

#[tauri::command]
fn set_noise_reduction(state: State<'_, AudioState>, enabled: bool, intensity: f32) -> Result<(), String> {
    let value = intensity.clamp(0.0, 1.0);
    state.noise_enabled.store(enabled, std::sync::atomic::Ordering::Relaxed);
    *state.noise_intensity.lock().unwrap() = value;
    Ok(())
}

#[tauri::command]
fn set_close_action(state: State<'_, AudioState>, action: String) -> Result<(), String> {
    state.close_to_tray.store(action != "quit", std::sync::atomic::Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
fn stop_audio(state: State<'_, AudioState>) -> Result<(), String> { stop_audio_inner(&state) }

#[tauri::command]
fn set_volume(state: State<'_, AudioState>, volume: f32) -> Result<(), String> {
    let value = volume.clamp(0.0, 2.0);
    *state.volume.lock().unwrap() = value;
    if let Some(e) = state.engine.lock().unwrap().as_ref() {
        *e.volume.lock().unwrap() = value;
    }
    Ok(())
}

#[tauri::command]
fn toggle_mute(state: State<'_, AudioState>) -> Result<bool, String> {
    let next = !state.muted.load(std::sync::atomic::Ordering::Relaxed);
    state.muted.store(next, std::sync::atomic::Ordering::Relaxed);
    if let Some(e) = state.engine.lock().unwrap().as_ref() {
        e.muted.store(next, std::sync::atomic::Ordering::Relaxed);
    }
    Ok(next)
}

#[tauri::command]
fn set_input(_state: State<'_, AudioState>, _name: String) -> Result<(), String> {
    Err("Le changement de périphérique à chaud sera ajouté après la V1 de test.".into())
}

#[tauri::command]
fn set_output(_state: State<'_, AudioState>, _name: String) -> Result<(), String> {
    Err("Le changement de périphérique à chaud sera ajouté après la V1 de test.".into())
}

fn startup_log(message: &str) {
    #[cfg(not(target_os = "windows"))]
    let _ = message;
    #[cfg(target_os = "windows")]
    {
        if let Ok(base) = std::env::var("LOCALAPPDATA") {
            let dir = std::path::PathBuf::from(base).join("DuoVoice");
            let _ = std::fs::create_dir_all(&dir);
            let path = dir.join("startup.log");
            use std::io::Write;
            if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
                let _ = writeln!(file, "{}", message);
            }
        }
    }
}

fn main() {
    startup_log("=== DuoVoice starting ===");
    let launched_from_autostart = std::env::args().any(|arg| arg == "--autostart");
    startup_log(&format!("autostart={launched_from_autostart}"));

    let result = tauri::Builder::default()
        .manage(AudioState {
            engine: Mutex::new(None),
            close_to_tray: std::sync::atomic::AtomicBool::new(true),
            volume: Arc::new(Mutex::new(1.0)),
            muted: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            noise_enabled: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            noise_intensity: Arc::new(Mutex::new(0.65)),
            remote: Arc::new(Mutex::new(None)),
        })
        .manage(Arc::new(DiscoveryState { peers: Mutex::new(HashMap::new()) }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .invoke_handler(tauri::generate_handler![
            list_devices, list_peers, add_manual_peer, start_audio, stop_audio, set_volume, toggle_mute, measure_latency, set_noise_reduction, set_input, set_output, set_close_action
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let to_tray = window.state::<AudioState>().close_to_tray.load(std::sync::atomic::Ordering::Relaxed);
                if to_tray {
                    api.prevent_close();
                    let _ = window.set_skip_taskbar(true);
                    let _ = window.hide();
                } else {
                    let _ = window.close();
                }
            }
        })
        .setup(move |app| {
            startup_log("Tauri setup entered");
            let discovery = app.state::<Arc<DiscoveryState>>().inner().clone();
            start_discovery(discovery);

            let show = MenuItem::with_id(app, "show", "Ouvrir DuoVoice", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Paramètres", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &settings, &quit])?;

            // Do not unwrap default_window_icon(): a missing icon must not crash the whole app.
            let icon = app.default_window_icon().cloned()
                .ok_or_else(|| tauri::Error::AssetNotFound("DuoVoice tray icon".into()))?;

            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .tooltip("DuoVoice")
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.set_skip_taskbar(false);
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.set_skip_taskbar(false);
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                        "settings" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.set_skip_taskbar(false);
                                let _ = w.show();
                                let _ = w.set_focus();
                                let _ = app.emit("open-settings", ());
                            }
                        }
                        "quit" => app.exit(0),
                        _ => {}
                    }
                })
                .build(app)?;

            if launched_from_autostart {
                startup_log("Hiding window because of autostart");
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.set_skip_taskbar(true);
                    let _ = w.hide();
                }
            } else if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }

            startup_log("Tauri setup completed");
            Ok(())
        })
        .run(tauri::generate_context!());

    match result {
        Ok(()) => startup_log("DuoVoice exited normally"),
        Err(e) => startup_log(&format!("DuoVoice startup error: {e}")),
    }
}
