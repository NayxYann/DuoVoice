# DuoVoice 1.5.0

DuoVoice is a lightweight Windows and Linux LAN intercom designed for fast, always-available voice communication between two computers on the same local network.

It is built for people who want a simple alternative to running a full voice-chat platform just to talk between nearby PCs. DuoVoice keeps the workflow direct: choose another DuoVoice computer, connect, and talk in both directions at the same time.

## Windows features

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

1. Launch DuoVoice on both computers (Windows or Linux).
2. Make sure both computers are connected to the same local network.
3. Choose the microphone and audio output you want to use.
4. Select the other computer from the detected-computer list.
5. Click **Connect** on each computer, selecting the other computer.
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

The included GitHub Actions workflows are:

- **Build Windows and Linux** — builds and tests both platforms on every push to `dev`, producing Windows installers and Linux downloads.
- **Release Windows and Linux** — manually publishes Windows installers/updater metadata and Linux AppImage/portable archive. The requested tag must match the project version.

The Windows bundle produces NSIS `.exe` and MSI `.msi` installers.

## Diagnostic log

DuoVoice keeps a small rotating diagnostic log at:

`%LOCALAPPDATA%\DuoVoice\duovoice.log`

The log is limited in size and is intended for startup, shutdown, audio, network and updater troubleshooting. Raw audio packets are not logged.

## Privacy

DuoVoice is intended for direct local-network communication. Voice traffic is exchanged between the selected LAN computers rather than being routed through a DuoVoice cloud service.

## Requirements

- Windows 10/11, or the Linux desktop described below
- A working microphone and audio output device
- Two computers reachable over the same local network for direct LAN use

## Project

DuoVoice is built with Tauri, Rust and a lightweight web frontend.

## Linux preview (KDE / Wayland)

Linux has its own simplified Breeze-inspired interface, native window decorations and KDE tray menu. Discovery, audio packets and RNNoise are shared with Windows. Windows retains its current interface and updater.

Linux includes editable machine name, detected computers/manual IPv4, microphone/output selection, mute, received volume (up to 200%), adjustable noise reduction, latency, saved preferences, French/English, login autostart and optional tray behavior. Left-click the tray icon to open/focus DuoVoice; right-click for Open, Settings and Quit. No Linux updater or rollback is included.

Audio uses the desktop's existing PipeWire PulseAudio service (or PulseAudio). Output monitors and application streams are omitted from the microphone list; usable virtual microphones remain available. Device lists refresh automatically; a failed stream or removed selected device stops the connection and displays an error.

To try it, open the latest successful **Build Windows and Linux** run on the Actions page and download **DuoVoice-Linux-x86_64**. Unzip it, mark the AppImage executable in KDE's file properties and launch it, or use:

```sh
chmod +x DuoVoice*.AppImage
./DuoVoice*.AppImage
```

If AppImage execution requires FUSE, extract the included `*-portable.tar.gz` instead and launch `DuoVoice/AppRun`. Keep the extracted folder in a stable location before enabling autostart. Runtime libraries are bundled: no separate Qt, WebKit or Rust installation is intended. A normal KDE desktop with its audio service and x86_64 Linux with glibc 2.35 or newer is required (Ubuntu/Kubuntu 22.04+). No virtual audio driver is installed.

Open DuoVoice on both computers and connect each to the other. Allow UDP ports `39471` and `39472` through both firewalls if needed.

Linux logs are at `$XDG_DATA_HOME/DuoVoice/duovoice.log`, normally `~/.local/share/DuoVoice/duovoice.log`. This is a first Linux preview; build checks do not replace a real KDE/Wayland audio test.
