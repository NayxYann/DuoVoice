// Keep the Windows console disabled for normal release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, Stream, StreamConfig, SupportedStreamConfig};
use serde::Serialize;
use std::{
    collections::{HashMap, VecDeque},
    io,
    net::{Ipv4Addr, SocketAddr, SocketAddrV4, UdpSocket, TcpListener, TcpStream},
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
const INSTANCE_PORT: u16 = 39473;

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
    paused: Arc<std::sync::atomic::AtomicBool>,
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

    // RNNoise is strictly mono, 48 kHz, 480 samples per frame.
    // The capture path is already downmixed to mono.
    let mut in_f = [0.0f32; FRAME_SAMPLES];
    let mut out_f = [0.0f32; FRAME_SAMPLES];
    for i in 0..FRAME_SAMPLES {
        in_f[i] = input[i] as f32;
    }

    d.process_frame(&mut out_f, &in_f);

    // RNNoise has one 10 ms frame of algorithmic delay. Never mix its delayed
    // output with the current dry signal: doing so creates an audible doubled
    // voice/short echo. Keep the dry frame delayed by exactly the same amount.
    let mut current_dry = [0i16; FRAME_SAMPLES];
    current_dry.copy_from_slice(input);
    let dry = delayed_dry.replace(current_dry);
    for i in 0..FRAME_SAMPLES {
        let wet = out_f[i].clamp(-32768.0, 32767.0);
        let dry_sample = dry.map(|frame| frame[i] as f32).unwrap_or(wet);
        output[i] = (dry_sample + (wet - dry_sample) * strength)
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
    let in_cfg = choose_stream_config(&input_device, true)?;
    let out_cfg = choose_stream_config(&output_device, false)?;
    app_log(&format!("Audio config: input={} {:?} {}ch, output={} {:?} {}ch", input_device.description().ok().map(|d| d.name().to_string()).unwrap_or_default(), in_cfg.sample_format(), in_cfg.channels(), output_device.description().ok().map(|d| d.name().to_string()).unwrap_or_default(), out_cfg.sample_format(), out_cfg.channels()));

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
    let paused = Arc::clone(&state.paused);

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
            let mut delayed_dry = None;
            let paused_in = Arc::clone(&paused);
            let noise_enabled = Arc::clone(&noise_enabled);
            let noise_intensity = Arc::clone(&noise_intensity);
            input_device.build_input_stream(input_config, move |data: &[f32], _| {
                if paused_in.load(std::sync::atomic::Ordering::Relaxed) || muted_in.load(std::sync::atomic::Ordering::Relaxed) {
                    tx_buf.lock().unwrap().clear();
                    return;
                }
                let mut b = tx_buf.lock().unwrap();
                for frame in data.chunks(input_channels.max(1)) {
                    let avg = frame.iter().copied().sum::<f32>() / frame.len().max(1) as f32;
                    b.push((avg.clamp(-1.0, 1.0) * 32767.0) as i16);
                }
                while b.len() >= FRAME_SAMPLES {
                    let mut processed = [0i16; FRAME_SAMPLES];
                    if noise_enabled.load(std::sync::atomic::Ordering::Relaxed) {
                        let intensity = *noise_intensity.lock().unwrap();
                        denoise_frame(&mut denoiser, &mut delayed_dry, &b[..FRAME_SAMPLES], intensity, &mut processed);
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
            let mut delayed_dry = None;
            let paused_in = Arc::clone(&paused);
            let noise_enabled = Arc::clone(&noise_enabled);
            let noise_intensity = Arc::clone(&noise_intensity);
            input_device.build_input_stream(input_config, move |data: &[i16], _| {
                if paused_in.load(std::sync::atomic::Ordering::Relaxed) || muted_in.load(std::sync::atomic::Ordering::Relaxed) {
                    tx_buf.lock().unwrap().clear();
                    return;
                }
                let mut b = tx_buf.lock().unwrap();
                for frame in data.chunks(input_channels.max(1)) {
                    let avg = frame.iter().map(|&x| x as i32).sum::<i32>() / frame.len().max(1) as i32;
                    b.push(avg.clamp(-32768, 32767) as i16);
                }
                while b.len() >= FRAME_SAMPLES {
                    let mut processed = [0i16; FRAME_SAMPLES];
                    if noise_enabled.load(std::sync::atomic::Ordering::Relaxed) {
                        let intensity = *noise_intensity.lock().unwrap();
                        denoise_frame(&mut denoiser, &mut delayed_dry, &b[..FRAME_SAMPLES], intensity, &mut processed);
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
            let mut delayed_dry = None;
            let paused_in = Arc::clone(&paused);
            let noise_enabled = Arc::clone(&noise_enabled);
            let noise_intensity = Arc::clone(&noise_intensity);
            input_device.build_input_stream(input_config, move |data: &[u16], _| {
                if paused_in.load(std::sync::atomic::Ordering::Relaxed) || muted_in.load(std::sync::atomic::Ordering::Relaxed) {
                    tx_buf.lock().unwrap().clear();
                    return;
                }
                let mut b = tx_buf.lock().unwrap();
                for frame in data.chunks(input_channels.max(1)) {
                    let avg = frame.iter().map(|&x| x as i32 - 32768).sum::<i32>() / frame.len().max(1) as i32;
                    b.push(avg.clamp(-32768, 32767) as i16);
                }
                while b.len() >= FRAME_SAMPLES {
                    let mut processed = [0i16; FRAME_SAMPLES];
                    if noise_enabled.load(std::sync::atomic::Ordering::Relaxed) {
                        let intensity = *noise_intensity.lock().unwrap();
                        denoise_frame(&mut denoiser, &mut delayed_dry, &b[..FRAME_SAMPLES], intensity, &mut processed);
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
    let paused_net = Arc::clone(&paused);
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
                    if paused_net.load(std::sync::atomic::Ordering::Relaxed) {
                        if let Ok(mut q) = rx_queue_net.try_lock() { q.clear(); }
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
    let output_paused = Arc::clone(&paused);
    let output_stream = match out_cfg.sample_format() {
        SampleFormat::F32 => {
            let q = Arc::clone(&rx_queue);
            let mut ready = false;
            output_device.build_output_stream(output_config, move |data: &mut [f32], _| {
                if output_paused.load(std::sync::atomic::Ordering::Relaxed) { for s in data.iter_mut() { *s = 0.0; } return; }
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
                if output_paused.load(std::sync::atomic::Ordering::Relaxed) { for s in data.iter_mut() { *s = 0; } return; }
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
                if output_paused.load(std::sync::atomic::Ordering::Relaxed) { for s in data.iter_mut() { *s = 32768; } return; }
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

    state.paused.store(false, std::sync::atomic::Ordering::Relaxed);
    *state.engine.lock().unwrap() = Some(AudioEngine { stop, volume, muted, _input: input_stream, _output: output_stream, _network: network });
    Ok(())
}

fn stop_audio_inner(state: &State<'_, AudioState>) -> Result<(), String> {
    state.paused.store(false, std::sync::atomic::Ordering::Relaxed);
    *state.remote.lock().unwrap() = None;
    if let Some(engine) = state.engine.lock().unwrap().take() {
        engine.stop.store(true, std::sync::atomic::Ordering::Relaxed);
        let _ = engine._network.join();
    }
    Ok(())
}


#[tauri::command]
fn set_paused(state: State<'_, AudioState>, paused: bool) -> Result<(), String> {
    if state.engine.lock().unwrap().is_none() {
        return Err("Aucune connexion audio active".into());
    }
    state.paused.store(paused, std::sync::atomic::Ordering::Relaxed);
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


#[derive(Clone, Serialize)]
struct AudioStatus {
    connected: bool,
    muted: bool,
    remote: Option<String>,
}

#[tauri::command]
fn audio_status(state: State<'_, AudioState>) -> AudioStatus {
    AudioStatus {
        connected: state.engine.lock().unwrap().is_some(),
        muted: state.muted.load(std::sync::atomic::Ordering::Relaxed),
        remote: state.remote.lock().unwrap().map(|addr| addr.ip().to_string()),
    }
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

fn app_log_path() -> Option<std::path::PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("LOCALAPPDATA")
            .map(std::path::PathBuf::from)
            .map(|p| p.join("DuoVoice").join("duovoice.log"))
    }
    #[cfg(target_os = "linux")]
    {
        std::env::var_os("XDG_DATA_HOME")
            .map(std::path::PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| std::path::PathBuf::from(h).join(".local").join("share")))
            .map(|p| p.join("DuoVoice").join("duovoice.log"))
    }
    #[cfg(target_os = "macos")]
    {
        std::env::var_os("HOME")
            .map(std::path::PathBuf::from)
            .map(|p| p.join("Library").join("Application Support").join("DuoVoice").join("duovoice.log"))
    }
}

fn app_log(message: &str) {
    use std::io::{Read, Write};
    const MAX_LOG_SIZE: u64 = 2 * 1024 * 1024;

    let Some(path) = app_log_path() else { return; };
    let Some(dir) = path.parent() else { return; };
    if std::fs::create_dir_all(dir).is_err() { return; }

    // Keep at most one small backup. We rotate before writing so the active
    // log can never grow beyond the configured limit by more than one entry.
    if let Ok(meta) = std::fs::metadata(&path) {
        if meta.len() >= MAX_LOG_SIZE {
            let backup = path.with_extension("log.1");
            let _ = std::fs::rename(&path, backup);
        }
    }

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(file, "[{timestamp}] {message}");
        let _ = file.flush();
    }

    // Defensive cap in case a very large single message is ever logged.
    if let Ok(meta) = std::fs::metadata(&path) {
        if meta.len() > MAX_LOG_SIZE {
            if let Ok(mut file) = std::fs::File::open(&path) {
                let mut data = Vec::new();
                if file.read_to_end(&mut data).is_ok() {
                    let keep = MAX_LOG_SIZE as usize;
                    if data.len() > keep {
                        let trimmed = &data[data.len() - keep..];
                        let _ = std::fs::write(&path, trimmed);
                    }
                }
            }
        }
    }
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn hide_window_to_tray(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_skip_taskbar(true);
        let _ = window.hide();
    }
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

fn main() {
    app_log("=== DuoVoice starting ===");
    let Some(instance_listener) = acquire_single_instance() else {
        app_log("Another DuoVoice instance is already running; requesting focus and exiting.");
        return;
    };
    let launched_from_autostart = std::env::args().any(|arg| arg == "--autostart");
    app_log(&format!("autostart={launched_from_autostart}"));

    let result = tauri::Builder::default()
        .manage(AudioState {
            engine: Mutex::new(None),
            close_to_tray: std::sync::atomic::AtomicBool::new(true),
            volume: Arc::new(Mutex::new(1.0)),
            muted: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            paused: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            noise_enabled: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            noise_intensity: Arc::new(Mutex::new(0.65)),
            remote: Arc::new(Mutex::new(None)),
        })
        .manage(Arc::new(DiscoveryState { peers: Mutex::new(HashMap::new()) }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .invoke_handler(tauri::generate_handler![
            list_devices, list_peers, add_manual_peer, start_audio, stop_audio, audio_status, set_volume, toggle_mute, set_paused, measure_latency, set_noise_reduction, set_input, set_output, set_close_action, quit_app, hide_window_to_tray
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "tray" {
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
                    let _ = window.close();
                }
            }
            if let tauri::WindowEvent::Focused(false) = event {
                if window.label() == "tray" {
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
                        let _ = focus_app.emit("focus-window", ());
                    }
                }
            });

            let quick = MenuItem::with_id(app, "quick", "Contrôle rapide", true, None::<&str>)?;
            let show = MenuItem::with_id(app, "show", "Ouvrir DuoVoice", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Paramètres", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quick, &show, &settings, &quit])?;

            // Do not unwrap default_window_icon(): a missing icon must not crash the whole app.
            let icon = app.default_window_icon().cloned()
                .ok_or_else(|| tauri::Error::AssetNotFound("DuoVoice tray icon".into()))?;

            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .tooltip("DuoVoice")
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, position, rect: _, .. } = event {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("tray") {
                            if w.is_visible().unwrap_or(false) {
                                let _ = w.hide();
                                return;
                            }
                            let width = 332.0_f64;
                            let height = 286.0_f64;
                            let x = f64::from(position.x) - width / 2.0;
                            // Tauri 2 exposes tray rect position/size as enums, so do not
                            // access `.y`/`.height` directly. The tray is normally at the
                            // bottom of the screen, therefore opening above the click point
                            // gives a compact and predictable placement without depending
                            // on a particular Physical/Logical variant.
                            let y = f64::from(position.y) - height - 8.0;
                            let _ = w.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(x.max(0.0) as i32, y.max(0.0) as i32)));
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "quick" => {
                            if let Some(w) = app.get_webview_window("tray") {
                                let _ = w.center();
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
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

            if let Some(w) = app.get_webview_window("tray") {
                let _ = w.hide();
                let _ = w.set_skip_taskbar(true);
            }

            if let Some(w) = app.get_webview_window("main") {
                // The frontend preference "Démarrer minimisé dans le tray" controls
                // both automatic and manual launches. Do not hide unconditionally
                // here, otherwise a fresh install would start invisibly.
                let _ = w.show();
                let _ = w.set_focus();
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
