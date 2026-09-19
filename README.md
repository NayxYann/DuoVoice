# DuoVoice 1.4.5

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

## Windows builds

This branch is Windows-only. The included GitHub Actions workflows are:

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
