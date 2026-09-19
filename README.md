# DuoVoice

> **DuoVoice is fully vibe-coded / AI-assisted.** I am not a software developer; this project started as a personal tool for communicating between Windows PCs on my local network. It is shared publicly because it may also be useful to others.

DuoVoice is a lightweight, low-latency **Windows LAN intercom** built with Tauri, Rust and a small HTML/CSS/JavaScript interface. It sends microphone audio directly between computers on the same local network without an account or cloud relay.

## Highlights

- Direct bidirectional audio over the local network
- One-to-one calls or LAN groups with up to **8 remote PCs**
- Dynamic group membership while a session is running
- Automatic recovery when a peer temporarily disappears and returns on the same IP
- Independent jitter buffers per remote peer and local mixing of received voices
- Microphone mute synchronized between the main window and tray controls
- Hot switching of microphone and output devices while connected
- Reusable audio profiles for microphone/output combinations
- RNNoise-based local microphone noise reduction
- Remote playback volume up to 200%
- Automatic LAN discovery plus manual IPv4 addresses
- Favorites and recent connection history
- Built-in diagnostics for network, audio devices, session state and logs
- Custom Windows system-tray quick panel and context menu
- Optional start with Windows, start minimized and close-to-tray behavior
- UI and tray scaling controls
- Multiple complete themes and accent colors
- English, French, Spanish and German interface languages
- Signed in-app updater with release history / rollback support
- Update checks at startup and every five minutes while DuoVoice is running

## What's new in 1.4.0

Version 1.4.0 focuses on making the Windows application more complete and resilient: LAN group sessions for up to eight remote PCs, saved audio profiles, recent-connection history, automatic session recovery when a peer returns on the same IP, and a built-in diagnostics panel. The home screen was also reorganized so group controls and audio profiles fit naturally into the existing DuoVoice design. The Windows tray is now group-aware and can reconnect the configured session directly.

## Session groups

DuoVoice remains simple for two computers: select a PC and press **Connect**.

For a group, add several discovered computers to the **Session** list before connecting. DuoVoice sends the local microphone stream to every member and mixes incoming streams locally. Up to eight remote computers can be part of one session.

Group membership can be changed while audio is active. If a remote PC briefly goes offline, the local audio engine stays alive and communication resumes automatically when that PC returns on the same address.

The custom Windows tray panel also shows the current Duo/group session. When a group is configured, the tray **Connect** action uses the saved group instead of silently falling back to a single peer.

## Audio profiles

Audio profiles store a microphone and output-device pair locally. Profiles are created and managed directly from the **Audio** card on the main screen, next to the currently selected devices. Choosing a saved profile applies it immediately, including while a session is active. They are useful for setups such as:

- GoXLR
- Headset
- Speakers
- Streaming

The former settings-only profile manager was removed so this workflow stays next to the microphone and output controls where it is actually used.

## Network

DuoVoice uses the following UDP ports:

| Port | Purpose |
| --- | --- |
| `39471/UDP` | LAN discovery |
| `39472/UDP` | Audio and latency probes |

Windows Firewall may ask for permission the first time DuoVoice starts. LAN discovery requires the computers to be able to exchange UDP broadcast traffic on the local network.

No account or Internet connection is required for audio communication. Internet access is only used for GitHub release/update checks and the GitHub link.

## Diagnostics

The Settings page includes a diagnostics section showing useful runtime information such as:

- local machine / DuoVoice name
- local IPv4 address
- DuoVoice UDP ports
- current audio-engine state
- active session peers
- active microphone and output device
- DuoVoice log-file path

Runtime logs are stored under `%LOCALAPPDATA%\DuoVoice\duovoice.log`. The log is size-limited and rotated automatically.

## Installation

Official release artifacts are Windows installers:

- NSIS `.exe`
- MSI `.msi`

Install a published release from the repository's **Releases** page. Signed updater artifacts are also published so installed copies can update through DuoVoice itself.

## Development

Requirements:

- Windows 10 or Windows 11
- Node.js
- Rust toolchain
- Tauri prerequisites for Windows

Install frontend dependencies:

```powershell
npm install
```

Run the development build:

```powershell
npm run tauri -- dev
```

Create a Windows build:

```powershell
npm run tauri -- build
```

## Privacy

DuoVoice does not require an account and does not intentionally upload voice traffic to a server. Audio packets are sent directly to the selected LAN peers. Application preferences, favorites, recent connections and audio profiles are stored locally.

## Project status

DuoVoice is primarily a personal project and should be considered best-effort software. The current target is **Windows only**.

## License

No separate license has been declared yet. Unless a license file is added, normal copyright rules apply.
