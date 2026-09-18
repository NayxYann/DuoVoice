# DuoVoice 1.3.3

> **Vibe-coded project.** DuoVoice was built entirely through AI-assisted / vibe coding for personal use. I am not a software developer, and this repository started as a practical tool for my own local audio setup. It is shared publicly in case it is useful to someone else.

DuoVoice is a lightweight bidirectional audio intercom for Windows and Linux. It is designed for direct communication between computers on the same local network, with a compact interface, system-tray controls, device switching, and signed application updates.

## Highlights

- Full-duplex LAN audio between two DuoVoice clients.
- Automatic discovery of nearby DuoVoice machines.
- Custom client name broadcast on the local network.
- Manual IPv4 entries and persistent favorites.
- Hot switching of microphone and output devices while connected.
- Synchronized mute state between the main window and the tray panel.
- Adjustable remote volume and optional boost above 100%.
- Local RNNoise-based noise reduction with persistent settings.
- Compact left-click tray control panel and custom right-click tray menu.
- Optional tray icon, startup-to-tray behavior, and configurable close action.
- Persistent UI scale and tray scale.
- Accent colors and complete **Themes++** palettes.
- Signed updates through GitHub Releases, with optional rollback to older signed releases.
- Automatic update checks at startup and every 5 minutes while the app is open.
- Interface languages: **English, French, Spanish, and German**. English is the default.

## Themes++

DuoVoice includes complete interface palettes that apply to the main window, tray panel, tray menu, and dialogs:

- DuoVoice
- Windows XP
- Axolotl
- Cherry Blossom
- Sage
- Ocean

The theme system separates accent, success, danger, update, text, surface, and border colors so status colors remain readable and consistent.

## System tray

The tray icon is enabled by default on a fresh installation.

Left click opens the compact DuoVoice control panel with quick access to connection, mute, the main window, settings, and quit controls.

Right click opens a custom DuoVoice-styled menu with shortcuts to the main window, settings, the GitHub project page, and quit.

The tray UI follows the selected theme, language, and tray scale.

## Updates and version rollback

DuoVoice uses Tauri's signed updater and GitHub Releases.

The app checks for updates:

- once at startup;
- every 5 minutes while DuoVoice is running;
- whenever the user manually requests a check.

Checks are asynchronous and do not interrupt audio streaming or device discovery. Updates are never installed automatically.

The installed version shown in Settings is clickable. DuoVoice can list older signed GitHub Releases and reinstall one of them. The visible release label comes from the GitHub Release **name**, while the Git tag is kept as the technical version identifier.

## Network ports

DuoVoice uses:

- UDP `39471` for peer discovery;
- UDP `39472` for audio transport and latency probes;
- TCP `39473` on `127.0.0.1` only to prevent multiple local DuoVoice instances.

If a firewall blocks DuoVoice, allow UDP ports `39471` and `39472` on the private/local network.

## Audio format

The current audio transport uses mono PCM at 48 kHz / 16-bit with short frames intended for low-latency LAN communication.

## Development

Requirements include Node.js/npm, Rust, and the platform dependencies required by Tauri.

Install frontend dependencies:

```bash
npm install
```

Run the frontend development server:

```bash
npm run dev
```

Run DuoVoice through Tauri in development mode:

```bash
npm run tauri -- dev
```

Build the application locally:

```bash
npm run tauri -- build
```

`node_modules` is intentionally excluded from Git.

## Platform packages

The release workflow can produce, depending on the target platform:

- Windows NSIS installer (`.exe`)
- Windows MSI package (`.msi`)
- Linux AppImage
- Linux Debian package (`.deb`)

Linux tray behavior can vary slightly depending on the desktop environment, tray/AppIndicator support, and whether the session uses X11 or Wayland.

## Diagnostics

DuoVoice writes a bounded diagnostic log containing startup/shutdown events and useful network, audio, and updater errors. Audio packets themselves are not logged.

Typical locations:

- Windows: `%LOCALAPPDATA%\\DuoVoice\\duovoice.log`
- Linux: `$XDG_DATA_HOME/DuoVoice/duovoice.log` or `~/.local/share/DuoVoice/duovoice.log`

## Current 1.3.3 changes

- GitHub links are available from the main header, the left-click tray header, and the right-click tray menu.
- GitHub URLs open without a visible Windows CMD flash.
- Added persistent application language selection: English, French, Spanish, and German.
- English is used as the default language on a fresh profile.
- Main interface and tray interfaces react to language changes together.
- Added lightweight automatic update checks every 5 minutes, in addition to startup and manual checks.
- Reworked the public README for people discovering the project rather than for the original local release workflow.

## Disclaimer

DuoVoice is a personal project and is provided as-is. Test releases and network/audio behavior in your own environment before relying on it for anything important.
