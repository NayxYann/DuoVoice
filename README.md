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

## What's new in 1.4.3

Version 1.4.3 is a UI and workflow polish release. Duo and LAN Group are kept intentionally separate: Duo is a direct connection to one detected/manual/favorite PC, while LAN Group uses named rooms advertised on the local network.

The main window now keeps Connection and Audio aligned to the same visual height, removes dead space, and adds an in-card Duo connection summary with the active peer, address and latency. The microphone monitor meter is hidden when the test is inactive and uses a more readable response curve while monitoring.

LAN rooms remain capped at 12 participants. Creating a room does not join it automatically; locally hosted rooms stay advertised while DuoVoice is running, show their host, can be joined with one click, and can only be deleted by their local host with confirmation. Once a room is joined, the available-room list is replaced by the active-room participant view.

Settings now scroll as one page, including the Settings title, rather than leaving a floating heading above the content. Close-to-tray remains the default close behavior when the tray icon is enabled.

## Duo and LAN groups

In **Duo**, select a detected computer, add/select a manual IP, or choose a favorite, then press **Connect**. Favorites are shortcuts only; they are never required. While connected, the Connection card displays the active peer and current latency directly.

In **LAN Group**, create or discover a named room. Creating a room advertises it but does not join it. Click a room to join it. The room view shows the host and active participants, with **Leave room** for members and **Delete room** only for a room hosted by this PC.

The tray remains a compact quick-control surface; detailed room creation and deletion stay in the main application.

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
