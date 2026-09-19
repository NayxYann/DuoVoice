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
const SESSION_KEY = "duovoice.sessionPeers";

const iconSvg = (content) => `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true">${content}</svg>`;
const ICONS = {
  link: iconSvg('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'),
  star: iconSvg('<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z"/>'),
  x: iconSvg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
};

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

function applyTheme(themeName, colorName) {
  const theme = normalizeThemeName(themeName || localStorage.getItem(THEME_KEY) || "duovoice");
  const color = colorName || localStorage.getItem(COLOR_KEY) || "violet";
  applyThemeVariables(document.documentElement, theme, color);
  invoke("set_tray_theme_icon", { theme, color }).catch(() => {});
}

function favoriteItems() {
  try {
    const value = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    return Array.isArray(value) ? value.filter(item => item?.address) : [];
  } catch { return []; }
}

function configuredSessionPeers() {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) || "[]");
    return Array.isArray(value) ? [...new Set(value.filter(Boolean))].slice(0, 8) : [];
  } catch { return []; }
}

function saveSessionPeers(values) {
  const normalized = [...new Set(values.filter(Boolean))].slice(0, 8);
  const previous = configuredSessionPeers();
  if (JSON.stringify(previous) !== JSON.stringify(normalized)) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(normalized));
    emit("session-changed", { remotes: normalized }).catch(() => {});
  }
  return normalized;
}

function saveFavorites(values) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(values));
  emit("favorites-changed", {}).catch(() => {});
}

function peerLabel(address) {
  return peers.find(item => item.address === address)?.name
    || favoriteItems().find(item => item.address === address)?.name
    || address;
}

function closePopovers(except = "") {
  for (const id of ["traySessionPopover", "trayFavoritesPopover"]) {
    if (id === except) continue;
    $(id)?.classList.add("hidden");
  }
  $("traySessionButton")?.setAttribute("aria-expanded", String(except === "traySessionPopover"));
  $("trayFavoritesButton")?.setAttribute("aria-expanded", String(except === "trayFavoritesPopover"));
}

function togglePopover(id) {
  const popover = $(id);
  if (!popover) return;
  const opening = popover.classList.contains("hidden");
  closePopovers(opening ? id : "");
  popover.classList.toggle("hidden", !opening);
  $("traySessionButton")?.setAttribute("aria-expanded", String(!$("traySessionPopover").classList.contains("hidden")));
  $("trayFavoritesButton")?.setAttribute("aria-expanded", String(!$("trayFavoritesPopover").classList.contains("hidden")));
}

function renderPeerSelect() {
  const select = $("trayPeer");
  if (!select) return;
  const current = select.value;
  const activeSet = new Set(configuredSessionPeers().length ? configuredSessionPeers() : remotes);
  select.innerHTML = "";
  const placeholder = new Option(peers.length ? t("tray.choosePc") : t("tray.noDetected"), "");
  select.add(placeholder);
  const favorites = new Set(favoriteItems().map(item => item.address));
  const candidates = peers
    .filter(item => !activeSet.has(item.address))
    .sort((a, b) => Number(favorites.has(b.address)) - Number(favorites.has(a.address)) || a.name.localeCompare(b.name));
  for (const item of candidates) select.add(new Option(`${favorites.has(item.address) ? "★ " : ""}${item.name}`, item.address));
  if ([...select.options].some(option => option.value === current)) select.value = current;
  $("trayAddPeer").disabled = !select.value || activeSet.size >= 8;
}

function renderSession() {
  const configured = configuredSessionPeers();
  const members = configured.length ? configured : (connected ? remotes : []);
  const participantCount = members.length ? members.length + 1 : 1;
  const summary = !members.length
    ? t("group.none")
    : members.length === 1
      ? t("group.duoSummary", { count: participantCount })
      : t("group.groupSummary", { count: participantCount });
  $("traySessionSummary").textContent = summary;
  $("traySessionCount").textContent = t("group.participantCount", { count: members.length ? participantCount : 0 });

  const box = $("traySessionMembers");
  box.innerHTML = "";
  if (!members.length) {
    box.innerHTML = `<div class="tray-empty">${t("group.none")}</div>`;
  } else {
    for (const address of members) {
      const active = connected && remotes.includes(address);
      const discovered = peers.some(item => item.address === address);
      const reconnecting = active && !discovered;
      const state = active ? (reconnecting ? t("group.reconnecting") : t("status.connected")) : (discovered ? t("connection.available") : t("connection.unavailable"));
      const row = document.createElement("div");
      row.className = `tray-member-row${active ? " active" : ""}${reconnecting ? " reconnecting" : ""}`;
      row.innerHTML = `<span class="tray-member-dot"></span><span class="tray-member-copy"><strong>${peerLabel(address)}</strong><small>${address}</small></span><span class="tray-member-state">${state}</span>`;
      const actions = document.createElement("span");
      actions.className = "tray-row-actions";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "tray-row-action danger";
      remove.innerHTML = ICONS.x;
      remove.title = t("group.remove");
      remove.addEventListener("click", event => { event.stopPropagation(); removeSessionPeer(address); });
      actions.appendChild(remove);
      row.appendChild(actions);
      box.appendChild(row);
    }
  }
  renderPeerSelect();
}

function renderFavorites() {
  const favorites = favoriteItems().sort((a, b) => String(a.name || a.address).localeCompare(String(b.name || b.address)));
  $("trayFavoritesSummary").textContent = t("connection.favoritesCount", { count: favorites.length });
  $("trayFavoritesCount").textContent = t("connection.favoritesCount", { count: favorites.length });
  const box = $("trayFavoritesList");
  box.innerHTML = "";
  if (!favorites.length) {
    box.innerHTML = `<div class="tray-empty">${t("tray.noFavorites")}</div>`;
    return;
  }
  for (const favorite of favorites) {
    const available = peers.some(item => item.address === favorite.address);
    const active = connected && remotes.includes(favorite.address);
    const row = document.createElement("div");
    row.className = `tray-favorite-row${available ? " available" : ""}`;
    row.innerHTML = `<span class="tray-member-dot"></span><span class="tray-member-copy"><strong>${favorite.name || favorite.address}</strong><small>${favorite.address}</small></span>`;
    const actions = document.createElement("span");
    actions.className = "tray-row-actions";
    const connectButton = document.createElement("button");
    connectButton.type = "button";
    connectButton.className = "tray-row-action";
    connectButton.innerHTML = ICONS.link;
    connectButton.title = active ? t("status.connected") : t("connection.connect");
    connectButton.disabled = !available || active;
    connectButton.addEventListener("click", event => { event.stopPropagation(); connectOrAddFavorite(favorite.address); });
    const starButton = document.createElement("button");
    starButton.type = "button";
    starButton.className = "tray-row-action";
    starButton.innerHTML = ICONS.star;
    starButton.title = t("connection.favoriteRemoved");
    starButton.addEventListener("click", event => {
      event.stopPropagation();
      saveFavorites(favoriteItems().filter(item => item.address !== favorite.address));
      renderFavorites();
    });
    actions.append(connectButton, starButton);
    row.appendChild(actions);
    box.appendChild(row);
  }
}

function updateStatus() {
  const status = $("trayStatus");
  status.className = `tray-status ${connected ? "online" : "offline"}`;
  status.innerHTML = `<i></i><span>${connected ? t("status.connected") : t("status.offline")}</span>`;
  $("quickConnectText").textContent = connected ? t("tray.quitSession") : t("tray.connection");
  $("quickConnect").classList.toggle("disconnect", connected);
  $("quickConnect").classList.toggle("primary", !connected);
  renderSession();
  renderFavorites();
}

async function refreshState() {
  try {
    const state = await invoke("audio_status");
    connected = Boolean(state.connected);
    remotes = Array.isArray(state.remotes) ? state.remotes : (state.remote ? [state.remote] : []);
    remote = remotes[0] || "";
    if (connected && remotes.length) saveSessionPeers(remotes);
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
    renderPeerSelect();
    renderSession();
    renderFavorites();
  } catch {}
}

async function setLivePeers(targets) {
  const normalized = saveSessionPeers(targets);
  if (!connected) {
    renderSession();
    return normalized;
  }
  if (!normalized.length) {
    await invoke("stop_audio");
    connected = false;
    remotes = [];
    remote = "";
  } else {
    remotes = await invoke("set_audio_peers", { remotes: normalized });
    remote = remotes[0] || "";
    saveSessionPeers(remotes);
  }
  await emit("audio-state-changed");
  updateStatus();
  return remotes;
}

async function addSelectedPeer() {
  const address = $("trayPeer").value;
  if (!address) return;
  const base = new Set(configuredSessionPeers().length ? configuredSessionPeers() : remotes);
  if (base.size >= 8) return;
  base.add(address);
  try { await setLivePeers([...base]); } catch (error) { invoke("log_client_error", { message: `Tray group add: ${String(error)}` }).catch(() => {}); }
}

async function removeSessionPeer(address) {
  const base = new Set(configuredSessionPeers().length ? configuredSessionPeers() : remotes);
  base.delete(address);
  try { await setLivePeers([...base]); } catch (error) { invoke("log_client_error", { message: `Tray group remove: ${String(error)}` }).catch(() => {}); }
}

async function connectOrAddFavorite(address) {
  if (!address) return;
  try {
    if (connected) {
      const base = new Set(remotes);
      if (base.size >= 8) return;
      base.add(address);
      await setLivePeers([...base]);
      return;
    }
    saveSessionPeers([address]);
    await startConfiguredSession([address]);
  } catch (error) {
    invoke("log_client_error", { message: `Tray favorite connect: ${String(error)}` }).catch(() => {});
  }
}

async function startConfiguredSession(targets) {
  const normalized = [...new Set(targets.filter(Boolean))].slice(0, 8);
  if (!normalized.length) return false;
  const input = localStorage.getItem("duovoice.input") || null;
  const output = localStorage.getItem("duovoice.output") || null;
  await invoke("start_audio", { remote: normalized[0], remotes: normalized, input, output });
  const volume = Math.max(0, Math.min(2, Number(localStorage.getItem("duovoice.volume") ?? 100) / 100));
  await invoke("set_volume", { volume });
  connected = true;
  remotes = normalized;
  remote = normalized[0];
  saveSessionPeers(normalized);
  await emit("audio-state-changed");
  return true;
}

async function connectSelected() {
  if (busy) return;
  busy = true;
  $("quickConnect").disabled = true;
  try {
    if (connected) {
      await invoke("stop_audio");
      connected = false;
      remotes = [];
      remote = "";
      await emit("audio-state-changed");
    } else {
      const configured = configuredSessionPeers();
      const fallback = favoriteItems().find(item => peers.some(peer => peer.address === item.address))?.address || peers[0]?.address;
      const targets = configured.length ? configured : (fallback ? [fallback] : []);
      if (!targets.length) {
        togglePopover("traySessionPopover");
        return;
      }
      await startConfiguredSession(targets);
    }
    await refreshState();
  } catch (error) {
    invoke("log_client_error", { message: `Tray connect: ${String(error)}` }).catch(() => {});
  } finally {
    busy = false;
    $("quickConnect").disabled = false;
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

function applyLanguage() {
  applyStaticTranslations(document, getLanguage());
  updateStatus();
}

function setQuitConfirmation(open) {
  closePopovers();
  const layer = $("quitConfirm");
  layer.classList.toggle("open", open);
  layer.setAttribute("aria-hidden", String(!open));
  if (open) $("cancelQuit").focus();
}

async function loadTrayVersion() {
  try {
    const version = await getVersion();
    document.querySelector(".tray-version").textContent = version;
  } catch {}
}

$("traySessionButton").addEventListener("click", event => { event.stopPropagation(); togglePopover("traySessionPopover"); });
$("trayFavoritesButton").addEventListener("click", event => { event.stopPropagation(); togglePopover("trayFavoritesPopover"); });
$("closeTraySession").addEventListener("click", event => { event.stopPropagation(); closePopovers(); });
$("closeTrayFavorites").addEventListener("click", event => { event.stopPropagation(); closePopovers(); });
$("traySessionPopover").addEventListener("click", event => event.stopPropagation());
$("trayFavoritesPopover").addEventListener("click", event => event.stopPropagation());
$("trayPeer").addEventListener("change", renderPeerSelect);
$("trayAddPeer").addEventListener("click", addSelectedPeer);
$("quickConnect").addEventListener("click", connectSelected);
$("quickMute").addEventListener("click", toggleMute);
$("openApp").addEventListener("click", () => openMain(false));
$("openSettings").addEventListener("click", () => openMain(true));
$("closeTray").addEventListener("click", () => getCurrentWindow().hide());
$("quitTray").addEventListener("click", () => setQuitConfirmation(true));
$("cancelQuit").addEventListener("click", () => setQuitConfirmation(false));
$("confirmQuit").addEventListener("click", () => invoke("quit_app"));
$("quitConfirm").addEventListener("click", event => { if (event.target === $("quitConfirm")) setQuitConfirmation(false); });

document.addEventListener("click", event => {
  if (!event.target.closest(".tray-popover-anchor")) closePopovers();
});

document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  if (!$("traySessionPopover").classList.contains("hidden") || !$("trayFavoritesPopover").classList.contains("hidden")) closePopovers();
  else if ($("quitConfirm").classList.contains("open")) setQuitConfirmation(false);
  else getCurrentWindow().hide();
});

window.addEventListener("storage", event => {
  if (event.key === COLOR_KEY || event.key === THEME_KEY) applyTheme();
  if (event.key === TRAY_SCALE_KEY) applyTrayScale(event.newValue || "1");
  if (event.key === LANGUAGE_KEY) applyLanguage();
  if (event.key === SESSION_KEY || event.key === FAVORITES_KEY) updateStatus();
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
window.addEventListener("blur", () => { closePopovers(); setQuitConfirmation(false); stopPolling(); });

listen("theme-changed", event => applyTheme(event.payload?.theme, event.payload?.color)).catch(() => {});
listen("tray-scale-changed", event => applyTrayScale(event.payload?.scale || 1)).catch(() => {});
listen("audio-state-changed", refreshState).catch(() => {});
listen("session-changed", updateStatus).catch(() => {});
listen("favorites-changed", renderFavorites).catch(() => {});
listen("language-changed", applyLanguage).catch(() => {});

async function openProjectGithub() { await invoke("open_project_github").catch(() => {}); }
$("trayGithubBrand").addEventListener("click", openProjectGithub);
$("trayGithubBrand").addEventListener("keydown", event => {
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openProjectGithub(); }
});

applyTrayScale(localStorage.getItem(TRAY_SCALE_KEY) || "1");
applyStaticTranslations(document, getLanguage());
applyTheme(localStorage.getItem(THEME_KEY) || "duovoice", localStorage.getItem(COLOR_KEY) || "violet");
loadTrayVersion();
refreshPeers();
refreshState();
