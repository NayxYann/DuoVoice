# DuoVoice

> **DuoVoice is fully vibe-coded / AI-assisted.** I am not a software developer; this project started as a personal tool for communicating between Windows PCs on my local network. It is shared publicly because it may also be useful to others.

DuoVoice is a lightweight, low-latency **Windows LAN intercom** built with Tauri, Rust and a small HTML/CSS/JavaScript interface. It sends microphone audio directly between computers on the same local network without an account or cloud relay.

## Highlights

- Direct bidirectional audio over the local network
- Automatic Duo / Group sessions with up to **8 remote PCs**
- Add or remove one participant without dropping the rest of the active session
- Automatic recovery when a peer temporarily disappears and returns on the same IP
- Independent jitter buffers per remote peer and local mixing of received voices
- Compact Session and Favorites controls with floating management panels
- Session and Favorites management directly from the custom Windows tray panel
- Microphone mute synchronized between the main window and tray controls
- Hot switching of microphone and output devices while connected
- RNNoise-based local microphone noise reduction
- Remote playback volume up to 200%
- Built-in output test and one-click access to diagnostics
- Automatic LAN discovery plus manual IPv4 addresses
- Favorites and recent connection history
- Built-in diagnostics for network, audio devices, session state and logs
- Custom Windows system-tray quick panel and context menu
- Theme-aware tray icon that follows the selected DuoVoice theme/accent
- Optional start with Windows, start minimized and close-to-tray behavior
- UI and tray scaling controls
- Multiple complete themes and accent colors
- English, French, Spanish and German interface languages
- Signed in-app updater with release history / rollback support
- Update checks at startup and every five minutes while DuoVoice is running

## What's new in 1.4.0

Version 1.4.0 turns the original two-PC intercom into a cleaner multi-PC Windows application without making the normal Duo workflow more complicated.

A **Session** is now the single source of truth. Connecting to one remote PC creates a Duo session; adding more remote PCs automatically turns it into a Group. Removing one member only removes that member, and the remaining audio streams stay active. If a peer briefly disappears from the LAN, DuoVoice keeps the session alive so that peer can recover when it returns on the same address.

The home screen keeps the established DuoVoice layout but avoids permanently expanding long lists. **Session** and **Favorites** are compact full-width controls; clicking either opens an anchored floating panel above the interface, so a large group or favorites collection does not stretch the main window. The Windows tray uses the same compact interaction model for quick management without opening the full application.

The Audio side also gains an **Audio actions** area for mute, output testing and direct access to Diagnostics. Device selectors, controls and spacing stay consistent with the existing DuoVoice design system, and all new surfaces use theme variables rather than a hard-coded color scheme. The native tray icon now follows the selected theme or DuoVoice accent color as well.

## Sessions and groups

For the normal two-computer workflow, select a remote PC and press **Connect**. DuoVoice starts a Duo session automatically.

To add another machine, choose it in **Remote computer** and use the add-participant button. The active Session becomes a Group automatically. Click the compact **Session** row to view participants, connection/recovery state and individual remove actions.

Removing a participant never intentionally disconnects the other members. The whole audio session ends only when the last remote participant is removed or when **Leave session / Disconnect** is used.

The tray quick panel exposes the same Session and Favorites summaries. It can add/remove participants, connect to a favorite, mute audio, open DuoVoice or Settings, and leave the active session without changing the mental model used by the main window.

## Themes

The default **DuoVoice** theme remains the neutral dark theme with a selectable accent color (violet by default on a fresh profile). Additional complete themes such as Windows XP, Axolotl, Cherry Blossom, Sage and Ocean keep their own palettes.

All main-window, tray-panel and tray-menu components use the selected theme variables. The native notification-area icon also changes to a matching variant, so a theme change stays coherent without redefining the base DuoVoice palette.

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

The home Audio card includes a shortcut to this section and a short output-device test. Runtime logs are stored under `%LOCALAPPDATA%\DuoVoice\duovoice.log`; the log is size-limited and rotated automatically.

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

DuoVoice does not require an account and does not intentionally upload voice traffic to a server. Audio packets are sent directly to the selected LAN peers. Application preferences, favorites, recent connections and the saved Session are stored locally.

## Project status

DuoVoice is primarily a personal project and should be considered best-effort software. The current target is **Windows only**.

## License

No separate license has been declared yet. Unless a license file is added, normal copyright rules apply.
