import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getVersion } from "@tauri-apps/api/app";
import { emit, listen } from "@tauri-apps/api/event";
import "./tray.css";
import { COLOR_KEY, THEME_KEY, applyThemeVariables, normalizeThemeName } from "./theme.js";
import { LANGUAGE_KEY, getLanguage, t, applyStaticTranslations } from "./i18n.js";

const $ = (id) => document.getElementById(id);
const MUTE_KEY = "duovoice.muted";
const FAVORITES_KEY = "duovoice.favorites";
const TRAY_SCALE_KEY = "duovoice.trayScale";

async function loadTrayVersion() {
  try {
    const version = await getVersion();
    const label = document.querySelector(".tray-version");
    if (label) label.textContent = version;
  } catch {}
}

let peers = [];
let connected = false;
let remote = "";
let remotes = [];
let busy = false;

function normalizedTrayScale(value) {
  const allowed = [0.9, 1, 1.1, 1.2];
  const numeric = Number(value) || 1;
  return allowed.reduce((best, candidate) =>
    Math.abs(candidate - numeric) < Math.abs(best - numeric) ? candidate : best, 1);
}

function applyTrayScale(value) {
  const scale = normalizedTrayScale(value);
  document.documentElement.style.setProperty("--tray-scale", String(scale));
  localStorage.setItem(TRAY_SCALE_KEY, String(scale));
}

applyTrayScale(localStorage.getItem(TRAY_SCALE_KEY) || "1");

function applyTheme(themeName, colorName) {
  const theme = normalizeThemeName(themeName || localStorage.getItem(THEME_KEY) || "duovoice");
  const color = colorName || localStorage.getItem(COLOR_KEY) || "violet";
  applyThemeVariables(document.documentElement, theme, color);
}

function applyLanguage() {
  applyStaticTranslations(document, getLanguage());
  renderPeers();
  updateStatus();
}

function favoriteAddresses() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]").map((item) => item.address).filter(Boolean);
  } catch {
    return [];
  }
}

function renderPeers() {
  const select = $("trayPeer");
  const selected = select.value || remote;
  select.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = peers.length ? t("tray.choosePc") : t("tray.noDetected");
  select.appendChild(placeholder);

  const favs = favoriteAddresses();
  const ordered = [...peers].sort((a, b) => Number(favs.includes(b.address)) - Number(favs.includes(a.address)));
  for (const peer of ordered) {
    const option = document.createElement("option");
    option.value = peer.address;
    option.textContent = favs.includes(peer.address) ? `★ ${peer.name}` : peer.name;
    option.title = peer.address;
    select.appendChild(option);
  }

  if (peers.some((peer) => peer.address === selected)) select.value = selected;
}

function updateStatus() {
  const status = $("trayStatus");
  status.className = `tray-status ${connected ? "online" : "offline"}`;
  status.innerHTML = `<i></i>${connected ? t("status.connected") : t("status.offline")}`;

  const peer = peers.find((item) => item.address === remote);
  $("trayPeerName").textContent = connected ? (remotes.length > 1 ? `${remotes.length} PCs` : (peer?.name || remote || t("status.connected"))) : t("tray.noHost");

  const connectButton = $("quickConnect");
  $("quickConnectText").textContent = connected ? t("connection.disconnect") : t("tray.connection");
  connectButton.classList.toggle("primary", !connected);
  connectButton.classList.toggle("disconnect", connected);

  if (connected && remote && peers.some((item) => item.address === remote)) {
    $("trayPeer").value = remote;
  }
}

async function refreshState() {
  try {
    const state = await invoke("audio_status");
    connected = Boolean(state.connected);
    remotes = Array.isArray(state.remotes) ? state.remotes : (state.remote ? [state.remote] : []);
    remote = remotes[0] || "";
    const muted = Boolean(state.muted);
    localStorage.setItem(MUTE_KEY, String(muted));
    $("quickMuteText").textContent = muted ? t("audio.unmute") : t("audio.mute");
    $("quickMute").classList.toggle("active", muted);
    updateStatus();
  } catch {}
}

async function refreshPeers() {
  try {
    peers = await invoke("list_peers");
    renderPeers();
    updateStatus();
  } catch {}
}

async function connectSelected() {
  if (busy) return;
  busy = true;
  const button = $("quickConnect");
  button.disabled = true;

  try {
    if (connected) {
      await invoke("stop_audio");
      connected = false;
      remotes = [];
      remote = "";
    } else {
      const address = $("trayPeer").value || favoriteAddresses()[0] || peers[0]?.address;
      if (!address) {
        await refreshPeers();
        $("trayPeer").focus();
        return;
      }

      const input = localStorage.getItem("duovoice.input") || null;
      const output = localStorage.getItem("duovoice.output") || null;
      await invoke("start_audio", { remote: address, remotes: [address], input, output });
      const volume = Math.max(0, Math.min(2, Number(localStorage.getItem("duovoice.volume") ?? 100) / 100));
      await invoke("set_volume", { volume });
      connected = true;
      remotes = [address];
      remote = address;
    }

    await emit("audio-state-changed");
    await refreshState();
  } catch (error) {
    invoke("log_client_error", { message: `Tray connect: ${String(error)}` }).catch(() => {});
    $("trayPeerName").textContent = ({en:"Connection error",fr:"Erreur de connexion",es:"Error de conexión",de:"Verbindungsfehler"})[getLanguage()];
  } finally {
    busy = false;
    button.disabled = false;
  }
}

async function toggleMute() {
  try {
    const muted = await invoke("toggle_mute");
    localStorage.setItem(MUTE_KEY, String(muted));
    $("quickMuteText").textContent = muted ? t("audio.unmute") : t("audio.mute");
    $("quickMute").classList.toggle("active", muted);
    await emit("audio-state-changed");
  } catch (error) {
    invoke("log_client_error", { message: `Tray mute: ${String(error)}` }).catch(() => {});
  }
}

async function openMain(settings = false) {
  try {
    await invoke("show_main_window", { settings });
    await getCurrentWindow().hide();
  } catch (error) {
    invoke("log_client_error", { message: `Tray open main: ${String(error)}` }).catch(() => {});
  }
}

function setQuitConfirmation(open) {
  const layer = $("quitConfirm");
  layer.classList.toggle("open", open);
  layer.setAttribute("aria-hidden", String(!open));
  if (open) $("cancelQuit").focus();
}

$("quickConnect").addEventListener("click", connectSelected);
$("quickMute").addEventListener("click", toggleMute);
$("openApp").addEventListener("click", () => openMain(false));
$("openSettings").addEventListener("click", () => openMain(true));
$("closeTray").addEventListener("click", () => getCurrentWindow().hide());
$("quitTray").addEventListener("click", () => setQuitConfirmation(true));
$("cancelQuit").addEventListener("click", () => setQuitConfirmation(false));
$("confirmQuit").addEventListener("click", () => invoke("quit_app"));
$("quitConfirm").addEventListener("click", (event) => {
  if (event.target === $("quitConfirm")) setQuitConfirmation(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if ($("quitConfirm").classList.contains("open")) setQuitConfirmation(false);
    else getCurrentWindow().hide();
  }
});

window.addEventListener("storage", (event) => {
  if (event.key === COLOR_KEY || event.key === THEME_KEY) applyTheme();
  if (event.key === TRAY_SCALE_KEY) applyTrayScale(event.newValue || "1");
  if (event.key === LANGUAGE_KEY) applyLanguage();
});

let peerTimer = null;
let stateTimer = null;

function startPolling() {
  if (peerTimer || stateTimer) return;
  refreshPeers();
  refreshState();
  peerTimer = setInterval(refreshPeers, 3000);
  stateTimer = setInterval(refreshState, 1500);
}

function stopPolling() {
  if (peerTimer) clearInterval(peerTimer);
  if (stateTimer) clearInterval(stateTimer);
  peerTimer = null;
  stateTimer = null;
}

window.addEventListener("focus", startPolling);
window.addEventListener("blur", () => {
  setQuitConfirmation(false);
  stopPolling();
});
listen("theme-changed", (event) => applyTheme(event.payload?.theme, event.payload?.color)).catch(() => {});
listen("tray-scale-changed", (event) => applyTrayScale(event.payload?.scale || 1)).catch(() => {});
listen("audio-state-changed", refreshState).catch(() => {});
listen("language-changed", applyLanguage).catch(() => {});


async function openProjectGithub() {
  await invoke("open_project_github").catch(() => {});
}

const trayGithubBrand = $("trayGithubBrand");
if (trayGithubBrand) {
  trayGithubBrand.addEventListener("click", openProjectGithub);
  trayGithubBrand.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openProjectGithub();
    }
  });
}
applyStaticTranslations(document, getLanguage());
applyTheme(localStorage.getItem(THEME_KEY) || "duovoice", localStorage.getItem(COLOR_KEY) || "violet");
refreshPeers();
refreshState();

loadTrayVersion();
