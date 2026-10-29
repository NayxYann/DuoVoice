# DuoVoice 1.4.8

DuoVoice is a lightweight Windows LAN intercom designed for fast, always-available voice communication between two computers on the same local network.

It is built for people who want a simple alternative to running a full voice-chat platform just to talk between nearby PCs. DuoVoice keeps the workflow direct: choose another DuoVoice computer, connect, and talk in both directions at the same time.

## What DuoVoice does

- Full-duplex two-way voice communication over the local network.
- Automatic discovery of other DuoVoice computers on the LAN.
- Manual IPv4 entry when automatic discovery is unavailable or blocked.
- Persistent favorites for frequently used computers.
- Custom network-visible computer name.
- Selectable microphone and audio output devices.
- Persistent remote-volume control, with an optional range above 100%.
- Mute control available from both the main window and the system tray.
- RNNoise-based microphone noise reduction with adjustable intensity.
- Live round-trip latency display while connected.
- Compact system-tray controls for connecting, disconnecting, muting and reopening DuoVoice.
- Configurable close behavior: minimize to tray or fully quit the application.
- Optional Windows startup and start-minimized behavior.
- Multiple visual themes and accent colors, including a tray icon that follows the selected theme.
- Signed update support through GitHub Releases.
- Version selector that can install another available signed DuoVoice release, whether older or newer than the currently installed version.
- Interface languages: English, French, Spanish and German. English is the default language.

## How it works

DuoVoice uses the local network directly. No external voice server or account is required for normal LAN communication.

1. Install and launch DuoVoice on both Windows computers.
2. Make sure both computers are connected to the same local network.
3. Choose the microphone and audio output you want to use.
4. Select the other computer from the detected-computer list.
5. Click **Connect**.
6. Both computers can now speak and listen at the same time.

If the other computer does not appear automatically, enter its local IPv4 address manually and add it to the list.

Favorites are useful for computers you connect to regularly. They remain available between launches and show whether the saved computer is currently reachable.

## Network ports

DuoVoice uses the following ports:

- UDP `39471` — LAN discovery.
- UDP `39472` — voice traffic and latency probes.
- TCP `39473` on `127.0.0.1` only — prevents multiple local DuoVoice instances from running at the same time.

If Windows Firewall or another firewall blocks local communication, allow DuoVoice on private networks or allow UDP ports `39471` and `39472`.

## Audio

DuoVoice currently uses mono PCM audio at 48 kHz / 16-bit with short packets intended for low-latency LAN communication.

The selected microphone, output device, volume, mute state and noise-reduction settings are saved and restored automatically.

Changing the active microphone or output while connected is supported without requiring a manual disconnect/reconnect cycle.

## Noise reduction

DuoVoice includes local RNNoise processing for the microphone. Noise reduction happens before microphone audio is sent over the network.

The intensity setting controls how strongly the processed signal is blended into the outgoing microphone signal. The setting and on/off state are persistent.

## System tray

When the tray icon is enabled, DuoVoice provides a compact control panel with quick access to:

- the detected remote computer;
- connect / disconnect;
- mute / unmute;
- the main DuoVoice window;
- settings;
- quitting DuoVoice completely.

The tray interface follows the selected DuoVoice theme, and the native tray icon changes to match the active theme or accent color.

## Languages

The application supports:

- English — default
- French
- Spanish
- German

The language can be changed from **Settings → Language**. The main window, tray controls and tray menu update together.

## Updates and version selection

DuoVoice can check signed releases published on GitHub.

The normal update banner reports when a newer release is available. The version selector in Settings can also show other signed releases and install a selected version even when it is older or newer than the currently installed build.

Only releases that include the updater metadata and valid signatures can be installed through this mechanism.

## Linux preview (KDE / GNOME)

The Linux edition is an opt-in preview with a separate application entry point, window, audio-device layer and release workflow. The Windows UI, Windows entry point, Windows release workflow and Windows updater manifest remain separate.

- KDE Plasma gets a Breeze-inspired layout; GNOME gets an Adwaita-inspired layout. The system's light or dark preference is followed, and native window decorations are used.
- The full connection, microphone, output, mute, received volume, RNNoise and latency controls are available in the main window. A tray icon is optional; DuoVoice stays usable when the desktop does not provide a compatible tray service.
- Audio uses PipeWire's PulseAudio service or PulseAudio, with an ALSA fallback. The Linux UI filters output-monitor sources from microphone choices.
- The preview supports English and French. It does not include automatic Linux updates or version rollback; install a newer AppImage manually.
- The Linux build targets x86_64 systems with glibc 2.35 or newer, such as Ubuntu/Kubuntu 22.04 and Debian 12 or later. Tauri's Linux WebKitGTK 4.1 baseline and a working desktop audio service are required. Other distributions need validation before being considered supported.

Make the AppImage executable in the file manager or run `chmod +x DuoVoice*.AppImage`, then launch it. If AppImage mounting fails because FUSE is unavailable, extract the portable archive and launch `DuoVoice/AppRun`. For first use, open DuoVoice on both computers and connect each to the other. Allow UDP ports `39471` and `39472` through both firewalls if needed.

The native tray uses StatusNotifier. KDE Plasma normally provides it; GNOME may require an AppIndicator/StatusNotifier extension. Without a working tray, the main window remains available and closing it exits the application.

**Build Linux** creates an AppImage and portable fallback for review. **Release Linux Preview** publishes only a prerelease with a Linux-specific tag; it does not replace or update the Windows stable release.

## Windows builds

The Windows workflows are:

- **Build Windows** — creates Windows installers.
- **Release Windows** — publishes a signed Windows release and updater metadata.

The Windows bundle produces NSIS `.exe` and MSI `.msi` installers.

## Diagnostic log

DuoVoice keeps a small rotating diagnostic log at:

`%LOCALAPPDATA%\DuoVoice\duovoice.log`

The log is limited in size and is intended for startup, shutdown, audio, network and updater troubleshooting. Raw audio packets are not logged.

## Privacy

DuoVoice is intended for direct local-network communication. Voice traffic is exchanged between the selected LAN computers rather than being routed through a DuoVoice cloud service.

## Requirements

- Windows 10 or Windows 11
- A working microphone and audio output device
- Two computers reachable over the same local network for direct LAN use

## Project

DuoVoice is built with Tauri, Rust and a lightweight web frontend.

## Audio under load (v1.4.7)

Capture and playback use bounded, preallocated SPSC queues. Noise reduction and UDP transmission run on a separate worker rather than inside the device callback. Audio workers register with Windows MMCSS; device callbacks retain CPAL realtime scheduling.

Playback reorders UDP frames within a bounded window. Its startup reserve begins at 40 ms, increases after starvation up to 180 ms and slowly decreases during stable playback. Short missing frames are concealed with a fading copy (up to 20 ms); extended interruptions rebuffer instead of repeating speech indefinitely. Backlogs are bounded and stale audio is trimmed after a load spike.

The DV01 mono PCM protocol remains unchanged: compatible with older Windows releases and the Linux preview. Saturated network links or stalled audio drivers can still cause interruptions. Diagnostic counters are written periodically from status refreshes and at disconnect in the existing local log; disk logging stays outside the audio workers; they are also included in `audio_status`.

## Startup favorites (v1.4.8)

Enable **Automatically connect to favorites at startup** in Settings > Startup
(default: off). The setting applies on the next launch, including launches minimized
to the tray. DuoVoice waits for network discovery and restores audio devices, mute,
volume and noise reduction before starting audio.

Only one peer can be connected at a time. The first available favorite in the order
added is selected. An offline favorite does not block other favorites. A manually
entered IP is eligible only once DuoVoice actually detects an announcement from that
address; a saved IP alone is not proof that a remote app is available.

Connection changes from the main window and tray are serialized. Any manual connect
or disconnect disarms automatic connection until the next launch, even if the manual
attempt fails. Successful automatic connection also ends the startup session; this
feature does not reconnect after a disconnection or switch to another favorite.
Device errors allow at most three attempts per address, spaced by 5 then 15 seconds.
Unavailable peers are waited for silently while the startup session remains active.
Disabling the setting cancels pending attempts and leaves an active call running.

The existing audio protocol is unchanged. Discovery confirms the remote app is
running, not that a two-way audio call has been accepted. As with manual connection,
the remote app must connect back to this PC (manually or using its own startup
favorites setting). No remote microphone is activated without that machine's choice.
