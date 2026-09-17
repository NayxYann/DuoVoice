#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, Stream, StreamConfig};
use serde::Serialize;
use std::{
    collections::HashMap,
    io,
    net::{Ipv4Addr, SocketAddr, SocketAddrV4, UdpSocket},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, State,
};

const DISCOVERY_PORT: u16 = 39471;
const AUDIO_PORT: u16 = 39472;
const MAGIC: &[u8; 4] = b"DV01";
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
fn list_peers() -> Vec<Peer> {
    let Ok(socket) = UdpSocket::bind(("0.0.0.0", DISCOVERY_PORT)) else { return vec![] };
    let _ = socket.set_read_timeout(Some(Duration::from_millis(120)));
    let hostname = hostname::get().ok().and_then(|h| h.into_string().ok()).unwrap_or_else(|| "DuoVoice".into());
    let msg = format!("DUOVOICE|{}|{}", hostname, AUDIO_PORT);
    let _ = socket.set_broadcast(true);
    let _ = socket.send_to(msg.as_bytes(), SocketAddrV4::new(Ipv4Addr::BROADCAST, DISCOVERY_PORT));

    let start = Instant::now();
    let mut peers = HashMap::<String, Peer>::new();
    let mut buf = [0u8; 512];
    while start.elapsed() < Duration::from_millis(250) {
        match socket.recv_from(&mut buf) {
            Ok((n, addr)) => {
                if let Ok(s) = std::str::from_utf8(&buf[..n]) {
                    let p: Vec<&str> = s.split('|').collect();
                    if p.len() == 3 && p[0] == "DUOVOICE" && p[1] != hostname {
                        if let Ok(port) = p[2].parse::<u16>() {
                            peers.insert(addr.ip().to_string(), Peer {
                                name: p[1].to_string(),
                                address: addr.ip().to_string(),
                                port,
                            });
                        }
                    }
                }
            }
            Err(ref e) if e.kind() == io::ErrorKind::WouldBlock || e.kind() == io::ErrorKind::TimedOut => break,
            Err(_) => break,
        }
    }
    peers.into_values().collect()
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
    let tx = UdpSocket::bind(("0.0.0.0", 0)).map_err(|e| e.to_string())?;
    tx.set_nonblocking(true).ok();
    let rx = UdpSocket::bind(("0.0.0.0", AUDIO_PORT)).map_err(|e| format!("Port audio {} indisponible: {}", AUDIO_PORT, e))?;
    rx.set_nonblocking(true).ok();

    let stop = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let volume = Arc::new(Mutex::new(1.0f32));
    let muted = Arc::new(std::sync::atomic::AtomicBool::new(false));

    let input_samples = Arc::new(Mutex::new(Vec::<i16>::with_capacity(FRAME_SAMPLES * 2)));
    let tx_buf = Arc::clone(&input_samples);
    let tx_socket = tx.try_clone().map_err(|e| e.to_string())?;
    let stop_in = Arc::clone(&stop);
    let muted_in = Arc::clone(&muted);
    let mut seq = 0u32;

    let input_config: StreamConfig = in_cfg.clone().into();
    let input_channels = input_config.channels as usize;
    let input_stream = match in_cfg.sample_format() {
        SampleFormat::F32 => input_device.build_input_stream(input_config, move |data: &[f32], _| {
            if muted_in.load(std::sync::atomic::Ordering::Relaxed) { return; }
            let mut b = tx_buf.lock().unwrap();
            for frame in data.chunks(input_channels.max(1)) {
                let avg = frame.iter().copied().sum::<f32>() / frame.len().max(1) as f32;
                b.push((avg.clamp(-1.0, 1.0) * 32767.0) as i16);
                if b.len() >= FRAME_SAMPLES {
                    push_packet(&tx_socket, remote_addr, &mut seq, &b[..FRAME_SAMPLES]);
                    b.drain(..FRAME_SAMPLES);
                }
            }
        }, |_| {}, None),
        SampleFormat::I16 => input_device.build_input_stream(input_config, move |data: &[i16], _| {
            if muted_in.load(std::sync::atomic::Ordering::Relaxed) { return; }
            let mut b = tx_buf.lock().unwrap();
            for frame in data.chunks(input_channels.max(1)) {
                let avg = frame.iter().map(|&x| x as i32).sum::<i32>() / frame.len().max(1) as i32;
                b.push(avg.clamp(-32768, 32767) as i16);
                if b.len() >= FRAME_SAMPLES {
                    push_packet(&tx_socket, remote_addr, &mut seq, &b[..FRAME_SAMPLES]);
                    b.drain(..FRAME_SAMPLES);
                }
            }
        }, |_| {}, None),
        SampleFormat::U16 => input_device.build_input_stream(input_config, move |data: &[u16], _| {
            if muted_in.load(std::sync::atomic::Ordering::Relaxed) { return; }
            let mut b = tx_buf.lock().unwrap();
            for frame in data.chunks(input_channels.max(1)) {
                let avg = frame.iter().map(|&x| x as i32 - 32768).sum::<i32>() / frame.len().max(1) as i32;
                b.push(avg.clamp(-32768, 32767) as i16);
                if b.len() >= FRAME_SAMPLES {
                    push_packet(&tx_socket, remote_addr, &mut seq, &b[..FRAME_SAMPLES]);
                    b.drain(..FRAME_SAMPLES);
                }
            }
        }, |_| {}, None),
        _ => return Err("Format audio non pris en charge".into()),
    }.map_err(|e| format!("Ouverture du micro impossible: {e}"))?;

    let output_config: StreamConfig = out_cfg.clone().into();
    let output_channels = output_config.channels as usize;
    let rx_buf = Arc::new(Mutex::new(Vec::<i16>::new()));
    let rx_buf_thread = Arc::clone(&rx_buf);
    let stop_net = Arc::clone(&stop);
    let network = thread::spawn(move || {
        let mut buf = [0u8; 4096];
        while !stop_net.load(std::sync::atomic::Ordering::Relaxed) {
            match rx.recv_from(&mut buf) {
                Ok((n, _)) => {
                    if let Some(packet) = read_packet(&buf[..n]) {
                        let mut q = rx_buf_thread.lock().unwrap();
                        q.extend(packet.samples);
                        if q.len() > FRAME_SAMPLES * 12 { q.drain(..FRAME_SAMPLES * 4); }
                    }
                }
                Err(ref e) if e.kind() == io::ErrorKind::WouldBlock => thread::sleep(Duration::from_millis(2)),
                Err(_) => break,
            }
        }
    });

    let output_volume = Arc::clone(&volume);
    let output_stop = Arc::clone(&stop);
    let output_queue = Arc::clone(&rx_buf);
    let output_stream = match out_cfg.sample_format() {
        SampleFormat::F32 => output_device.build_output_stream(output_config, move |data: &mut [f32], _| {
            let vol = *output_volume.lock().unwrap();
            let mut q = output_queue.lock().unwrap();
            for frame in data.chunks_mut(output_channels.max(1)) {
                let v = q.pop().unwrap_or(0) as f32 / 32768.0 * vol;
                for s in frame { *s = v; }
            }
            if output_stop.load(std::sync::atomic::Ordering::Relaxed) { for s in data { *s = 0.0; } }
        }, |_| {}, None),
        SampleFormat::I16 => output_device.build_output_stream(output_config, move |data: &mut [i16], _| {
            let vol = *output_volume.lock().unwrap();
            let mut q = output_queue.lock().unwrap();
            for frame in data.chunks_mut(output_channels.max(1)) {
                let v = (q.pop().unwrap_or(0) as f32 * vol).clamp(-32768.0, 32767.0) as i16;
                for s in frame { *s = v; }
            }
        }, |_| {}, None),
        SampleFormat::U16 => output_device.build_output_stream(output_config, move |data: &mut [u16], _| {
            let vol = *output_volume.lock().unwrap();
            let mut q = output_queue.lock().unwrap();
            for frame in data.chunks_mut(output_channels.max(1)) {
                let v = (q.pop().unwrap_or(0) as f32 * vol + 32768.0).clamp(0.0, 65535.0) as u16;
                for s in frame { *s = v; }
            }
        }, |_| {}, None),
        _ => return Err("Format de sortie non pris en charge".into()),
    }.map_err(|e| format!("Ouverture de la sortie impossible: {e}"))?;

    input_stream.play().map_err(|e| e.to_string())?;
    output_stream.play().map_err(|e| e.to_string())?;

    *state.engine.lock().unwrap() = Some(AudioEngine { stop, volume, muted, _input: input_stream, _output: output_stream, _network: network });
    Ok(())
}

fn stop_audio_inner(state: &State<'_, AudioState>) -> Result<(), String> {
    if let Some(engine) = state.engine.lock().unwrap().take() {
        engine.stop.store(true, std::sync::atomic::Ordering::Relaxed);
        let _ = engine._network.join();
    }
    Ok(())
}

#[tauri::command]
fn stop_audio(state: State<'_, AudioState>) -> Result<(), String> { stop_audio_inner(&state) }

#[tauri::command]
fn set_volume(state: State<'_, AudioState>, volume: f32) -> Result<(), String> {
    if let Some(e) = state.engine.lock().unwrap().as_ref() {
        *e.volume.lock().unwrap() = volume.clamp(0.0, 1.0);
    }
    Ok(())
}

#[tauri::command]
fn toggle_mute(state: State<'_, AudioState>) -> Result<bool, String> {
    if let Some(e) = state.engine.lock().unwrap().as_ref() {
        let next = !e.muted.load(std::sync::atomic::Ordering::Relaxed);
        e.muted.store(next, std::sync::atomic::Ordering::Relaxed);
        Ok(next)
    } else { Ok(false) }
}

#[tauri::command]
fn set_input(_state: State<'_, AudioState>, _name: String) -> Result<(), String> {
    Err("Le changement de périphérique à chaud sera ajouté après la V1 de test.".into())
}

#[tauri::command]
fn set_output(_state: State<'_, AudioState>, _name: String) -> Result<(), String> {
    Err("Le changement de périphérique à chaud sera ajouté après la V1 de test.".into())
}

fn main() {
    let launched_from_autostart = std::env::args().any(|arg| arg == "--autostart");

    tauri::Builder::default()
        .manage(AudioState { engine: Mutex::new(None) })
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .invoke_handler(tauri::generate_handler![
            list_devices, list_peers, start_audio, stop_audio, set_volume, toggle_mute, set_input, set_output
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(move |app| {
            let show = MenuItem::with_id(app, "show", "Ouvrir DuoVoice", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("DuoVoice")
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                        "quit" => app.exit(0),
                        _ => {}
                    }
                })
                .build(app)?;

            if launched_from_autostart {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| eprintln!("DuoVoice startup error: {e}"));
}
