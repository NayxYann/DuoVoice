//! Bounded, allocation-free audio callbacks; processing and UDP run separately.
use rtrb::{Consumer, Producer};
use serde::Serialize;
use std::{
    net::{SocketAddr, UdpSocket},
    sync::{atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering}, Arc, OnceLock},
    thread,
    time::{Duration, Instant},
};
use super::{Packet, FRAME_SAMPLES};

pub const PACKET_CAPACITY: usize = 64;
const MIN_RESERVE: usize = 4;
const MAX_RESERVE: usize = 18;

#[derive(Default)]
pub struct Metrics {
    received: AtomicU64,
    capture_dropped: AtomicU64,
    capture_trimmed: AtomicU64,
    send_failed: AtomicU64,
    queue_dropped: AtomicU64,
    late: AtomicU64,
    reordered: AtomicU64,
    concealed: AtomicU64,
    underruns: AtomicU64,
    trimmed: AtomicU64,
    reserve: AtomicU64,
    stream_errors: AtomicU64,
    last_logged: AtomicU64,
}

#[derive(Serialize, Debug)]
pub struct Snapshot {
    received_packets: u64,
    capture_dropped_samples: u64,
    capture_trimmed_samples: u64,
    send_failures: u64,
    receive_queue_drops: u64,
    late_packets: u64,
    reordered_packets: u64,
    concealed_frames: u64,
    playback_underruns: u64,
    playback_trimmed_frames: u64,
    buffer_ms: u64,
    stream_errors: u64,
}

impl Metrics {
    // Called by the UI status command: disk I/O must not stall an audio worker.
    pub fn log_if_due(&self) {
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
            .map(|time| time.as_secs()).unwrap_or(0);
        let previous = self.last_logged.load(Ordering::Relaxed);
        if now.saturating_sub(previous) >= 30
            && self.last_logged.compare_exchange(previous, now, Ordering::Relaxed, Ordering::Relaxed).is_ok() {
            super::app_log(&format!("Audio diagnostics: {:?}", self.snapshot()));
        }
    }
    pub fn snapshot(&self) -> Snapshot {
        Snapshot {
            received_packets: self.received.load(Ordering::Relaxed),
            capture_dropped_samples: self.capture_dropped.load(Ordering::Relaxed),
            capture_trimmed_samples: self.capture_trimmed.load(Ordering::Relaxed),
            send_failures: self.send_failed.load(Ordering::Relaxed),
            receive_queue_drops: self.queue_dropped.load(Ordering::Relaxed),
            late_packets: self.late.load(Ordering::Relaxed),
            reordered_packets: self.reordered.load(Ordering::Relaxed),
            concealed_frames: self.concealed.load(Ordering::Relaxed),
            playback_underruns: self.underruns.load(Ordering::Relaxed),
            playback_trimmed_frames: self.trimmed.load(Ordering::Relaxed),
            buffer_ms: self.reserve.load(Ordering::Relaxed) * 10,
            stream_errors: self.stream_errors.load(Ordering::Relaxed),
        }
    }
}

pub fn error_callback(metrics: Arc<Metrics>) -> impl FnMut(cpal::Error) + Send + 'static {
    move |_error| { metrics.stream_errors.fetch_add(1, Ordering::Relaxed); }
}

pub struct Capture {
    producer: Producer<i16>,
    wake: Arc<OnceLock<thread::Thread>>,
    metrics: Arc<Metrics>,
    muted: Arc<AtomicBool>,
}

impl Capture {
    pub fn new(producer: Producer<i16>, wake: Arc<OnceLock<thread::Thread>>, metrics: Arc<Metrics>, muted: Arc<AtomicBool>) -> Self {
        Self { producer, wake, metrics, muted }
    }

    pub fn write(&mut self, samples: impl Iterator<Item = i16>) {
        let muted = self.muted.load(Ordering::Relaxed);
        let mut dropped = 0;
        for sample in samples {
            if self.producer.push(if muted { 0 } else { sample }).is_err() { dropped += 1; }
        }
        if dropped != 0 { self.metrics.capture_dropped.fetch_add(dropped, Ordering::Relaxed); }
        if let Some(worker) = self.wake.get() { worker.unpark(); }
    }
}

pub struct Playback {
    consumer: Consumer<Packet>,
    slots: [Option<Packet>; PACKET_CAPACITY],
    expected: Option<u32>,
    highest: Option<u32>,
    held: usize,
    ready: bool,
    played: bool,
    reserve: usize,
    missing: usize,
    cursor: usize,
    current: [i16; FRAME_SAMPLES],
    previous: [i16; FRAME_SAMPLES],
    last_sample: i16,
    smooth_next: bool,
    last_arrival: Option<Instant>,
    stable_since: Instant,
    now: Instant,
    metrics: Arc<Metrics>,
}

impl Playback {
    pub fn new(consumer: Consumer<Packet>, metrics: Arc<Metrics>) -> Self {
        let now = Instant::now();
        metrics.reserve.store(MIN_RESERVE as u64, Ordering::Relaxed);
        Self {
            consumer, slots: std::array::from_fn(|_| None), expected: None,
            highest: None, held: 0, ready: false, played: false,
            reserve: MIN_RESERVE, missing: 0, cursor: FRAME_SAMPLES,
            current: [0; FRAME_SAMPLES], previous: [0; FRAME_SAMPLES],
            last_sample: 0, smooth_next: true, last_arrival: None, stable_since: now, now, metrics,
        }
    }

    fn reset(&mut self, sequence: u32) {
        self.slots.fill(None);
        self.expected = Some(sequence);
        self.highest = None;
        self.held = 0;
        self.ready = false;
        self.played = false;
        self.missing = 0;
        self.previous.fill(0);
        self.smooth_next = true;
        self.stable_since = self.now;
    }

    /// Drain at most one ring capacity per callback: processing stays bounded.
    pub fn receive(&mut self) {
        self.now = Instant::now();
        for _ in 0..PACKET_CAPACITY {
            let Ok(packet) = self.consumer.pop() else { break; };
            if let Some(expected) = self.expected {
                let backwards = expected.wrapping_sub(packet.seq);
                let after_silence = self.last_arrival.is_some_and(|t| packet.received_at.saturating_duration_since(t) >= Duration::from_millis(500));
                let restarted = backwards > PACKET_CAPACITY as u32 && backwards < u32::MAX / 2 && packet.seq < 256;
                if after_silence || restarted { self.reset(packet.seq); }
            }
            self.last_arrival = Some(packet.received_at);
            let expected = *self.expected.get_or_insert(packet.seq);
            let distance = packet.seq.wrapping_sub(expected);
            if distance > u32::MAX / 2 {
                if !self.played && expected.wrapping_sub(packet.seq) < PACKET_CAPACITY as u32 {
                    self.expected = Some(packet.seq);
                } else {
                    self.metrics.late.fetch_add(1, Ordering::Relaxed);
                    continue;
                }
            } else if distance >= PACKET_CAPACITY as u32 {
                // A large jump cannot be repaired within a realtime deadline.
                self.metrics.trimmed.fetch_add(self.held as u64, Ordering::Relaxed);
                self.reset(packet.seq);
                self.reserve = (self.reserve + 2).min(MAX_RESERVE);
            }
            if let Some(highest) = self.highest {
                if packet.seq.wrapping_sub(highest) > u32::MAX / 2 {
                    self.metrics.reordered.fetch_add(1, Ordering::Relaxed);
                } else { self.highest = Some(packet.seq); }
            } else { self.highest = Some(packet.seq); }
            let index = packet.seq as usize % PACKET_CAPACITY;
            if self.slots[index].is_none() { self.held += 1; }
            self.slots[index] = Some(packet);
        }
        self.metrics.reserve.store(self.reserve as u64, Ordering::Relaxed);
    }

    fn trim_before(&mut self, sequence: u32) {
        self.smooth_next = true;
        for slot in &mut self.slots {
            if slot.as_ref().is_some_and(|p| p.seq.wrapping_sub(sequence) > u32::MAX / 2) {
                *slot = None;
                self.held -= 1;
                self.metrics.trimmed.fetch_add(1, Ordering::Relaxed);
            }
        }
        self.expected = Some(sequence);
    }

    fn rebuffer(&mut self) {
        self.ready = false;
        self.smooth_next = true;
        self.reserve = (self.reserve + 2).min(MAX_RESERVE);
        self.stable_since = self.now;
        self.metrics.underruns.fetch_add(1, Ordering::Relaxed);
        self.metrics.reserve.store(self.reserve as u64, Ordering::Relaxed);
    }

    fn frame(&mut self) {
        self.current.fill(0);
        if !self.ready {
            if self.held < self.reserve { return; }
            self.ready = true;
            self.missing = 0;
            self.stable_since = self.now;
        }
        if self.now.saturating_duration_since(self.stable_since) >= Duration::from_secs(10) && self.reserve > MIN_RESERVE {
            self.reserve -= 1;
            self.stable_since = self.now;
            if self.held > self.reserve + 1 {
                self.trim_before(self.expected.unwrap().wrapping_add(1));
            }
            self.metrics.reserve.store(self.reserve as u64, Ordering::Relaxed);
        }
        if self.held > self.reserve + 8 {
            if let Some(highest) = self.highest { self.trim_before(highest.wrapping_sub(self.reserve as u32 - 1)); }
        }
        let Some(sequence) = self.expected else { return; };
        let index = sequence as usize % PACKET_CAPACITY;
        if self.slots[index].as_ref().is_some_and(|p| p.seq == sequence) {
            let packet = self.slots[index].take().unwrap();
            self.held -= 1;
            self.smooth_next |= self.missing > 0;
            self.current = packet.samples;
            self.previous = packet.samples;
            self.missing = 0;
            self.played = true;
        } else if self.missing < 2 && self.played {
            // Short losses are covered by a fading copy, never endless repetition.
            self.smooth_next = true;
            self.missing += 1;
            let gain = if self.missing == 1 { 0.6 } else { 0.25 };
            for (out, previous) in self.current.iter_mut().zip(self.previous) { *out = (previous as f32 * gain) as i16; }
            self.metrics.concealed.fetch_add(1, Ordering::Relaxed);
        } else {
            if self.held > 0 {
                let next = self.slots.iter().flatten().map(|p| p.seq).min_by_key(|s| s.wrapping_sub(sequence));
                if let Some(next) = next { self.trim_before(next); }
            }
            self.rebuffer();
            return;
        }
        self.expected = Some(sequence.wrapping_add(1));
        // Smooth frame boundaries, including loss concealment and backlog skips.
        if self.smooth_next {
          for i in 0..32 {
            let blend = (i + 1) as f32 / 32.0;
            self.current[i] = (self.last_sample as f32 * (1.0 - blend) + self.current[i] as f32 * blend) as i16;
          }
          self.smooth_next = false;
        }
    }

    pub fn next_sample(&mut self) -> i16 {
        if self.cursor == FRAME_SAMPLES { self.frame(); self.cursor = 0; }
        let sample = self.current[self.cursor];
        self.cursor += 1;
        self.last_sample = sample;
        sample
    }
}

pub fn transmit(mut input: Consumer<i16>, socket: UdpSocket, remote: SocketAddr, stop: Arc<AtomicBool>, muted: Arc<AtomicBool>, noise: Arc<AtomicBool>, intensity: Arc<AtomicU32>, metrics: Arc<Metrics>) {
    let _priority = MultimediaPriority::new();
    let mut sequence = 0;
    let mut denoiser = None;
    let mut delayed_dry = None;
    while !stop.load(Ordering::Relaxed) {
        let available = input.slots();
        if available > FRAME_SAMPLES * 8 {
            // Don't transmit a long burst of obsolete microphone audio after load.
            let trim = available - FRAME_SAMPLES * 2;
            for _ in 0..trim { let _ = input.pop(); }
            metrics.capture_trimmed.fetch_add(trim as u64, Ordering::Relaxed);
            denoiser = None;
            delayed_dry = None;
        }
        let mut samples = [0; FRAME_SAMPLES];
        if input.pop_entire_slice(&mut samples).is_err() {
            thread::park_timeout(Duration::from_millis(50));
            continue;
        }
        let mut processed = [0; FRAME_SAMPLES];
        if muted.load(Ordering::Relaxed) {
            denoiser = None;
            delayed_dry = None;
        } else if noise.load(Ordering::Relaxed) {
            super::denoise_frame(&mut denoiser, &mut delayed_dry, &samples, f32::from_bits(intensity.load(Ordering::Relaxed)), &mut processed);
        } else { denoiser = None; delayed_dry = None; processed = samples; }
        if super::push_packet(&socket, remote, &mut sequence, &processed).is_err() {
            metrics.send_failed.fetch_add(1, Ordering::Relaxed);
        }
    }
}

pub fn receive(mut output: Producer<Packet>, socket: UdpSocket, remote: SocketAddr, stop: Arc<AtomicBool>, metrics: Arc<Metrics>) {
    let _priority = MultimediaPriority::new();
    let mut buffer = [0; 4096];
    while !stop.load(Ordering::Relaxed) {
        match socket.recv_from(&mut buffer) {
            Ok((length, sender)) => {
                if length >= 12 && &buffer[..4] == super::PING_MAGIC {
                    let mut pong = [0; 12];
                    pong[..4].copy_from_slice(super::PONG_MAGIC);
                    pong[4..].copy_from_slice(&buffer[4..12]);
                    let _ = socket.send_to(&pong, sender);
                } else if sender.ip() == remote.ip() {
                    if let Some(packet) = super::read_packet(&buffer[..length]) {
                        metrics.received.fetch_add(1, Ordering::Relaxed);
                        if output.push(packet).is_err() { metrics.queue_dropped.fetch_add(1, Ordering::Relaxed); }
                    }
                }
            }
            Err(error) if matches!(error.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut | std::io::ErrorKind::Interrupted) => {},
            Err(error) => { super::app_log(&format!("Audio receive error: {error}")); break; }
        }
    }
}

/// Scoped MMCSS registration for workers; CPAL already prioritizes device threads.
#[cfg(target_os = "windows")]
struct MultimediaPriority(*mut std::ffi::c_void);
#[cfg(target_os = "windows")]
#[link(name = "avrt")]
extern "system" {
    fn AvSetMmThreadCharacteristicsW(task: *const u16, index: *mut u32) -> *mut std::ffi::c_void;
    fn AvSetMmThreadPriority(handle: *mut std::ffi::c_void, priority: i32) -> i32;
    fn AvRevertMmThreadCharacteristics(handle: *mut std::ffi::c_void) -> i32;
}
#[cfg(target_os = "windows")]
impl MultimediaPriority {
    fn new() -> Self {
        let task = [65u16, 117, 100, 105, 111, 0]; // "Audio"
        let mut index = 0;
        // Both pointers refer to live local values; the OS owns the returned handle.
        let handle = unsafe { AvSetMmThreadCharacteristicsW(task.as_ptr(), &mut index) };
        if handle.is_null() { super::app_log("MMCSS unavailable; using normal worker priority"); }
        else { unsafe { AvSetMmThreadPriority(handle, 1); } }
        Self(handle)
    }
}
#[cfg(target_os = "windows")]
impl Drop for MultimediaPriority {
    fn drop(&mut self) { if !self.0.is_null() { unsafe { AvRevertMmThreadCharacteristics(self.0); } } }
}
#[cfg(not(target_os = "windows"))]
struct MultimediaPriority;
#[cfg(not(target_os = "windows"))]
impl MultimediaPriority { fn new() -> Self { Self } }
