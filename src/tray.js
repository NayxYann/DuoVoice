import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { getVersion } from "@tauri-apps/api/app";
import { emit, listen } from "@tauri-apps/api/event";
import "./tray.css";
import { COLOR_KEY, THEME_KEY, applyThemeVariables, normalizeThemeName } from "./theme.js";
import { LANGUAGE_KEY, getLanguage, t, applyStaticTranslations } from "./i18n.js";

const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const MUTE_KEY = "duovoice.muted";
const FAVORITES_KEY = "duovoice.favorites";
const TRAY_SCALE_KEY = "duovoice.trayScale";
const SESSION_KEY = "duovoice.sessionPeers";
const COMMUNICATION_MODE_KEY = "duovoice.communicationMode";
const MAX_SESSION_PARTICIPANTS = 12;
const MAX_SESSION_REMOTES = MAX_SESSION_PARTICIPANTS - 1;

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
let activeRoom = null;
let trayScale = 1;
let fitQueued = false;
let roomsCache = [];
let roomSyncBusy = false;
let communicationMode = localStorage.getItem(COMMUNICATION_MODE_KEY) === "group" ? "group" : "duo";

function normalizedTrayScale(value) {
  const allowed = [0.9, 1, 1.1, 1.2];
  const numeric = Number(value) || 1;
  return allowed.reduce((best, candidate) =>
    Math.abs(candidate - numeric) < Math.abs(best - numeric) ? candidate : best, 1);
}

function fitTrayHeight() {
  if (fitQueued) return;
  fitQueued = true;
  requestAnimationFrame(async () => {
    fitQueued = false;
    const panel = document.querySelector(".tray-panel");
    if (!panel) return;

    let baseHeight = Math.max(300, Math.ceil(panel.scrollHeight));
    const panelRect = panel.getBoundingClientRect();
    for (const id of ["traySessionPopover", "trayFavoritesPopover"]) {
      const popover = $(id);
      if (!popover || popover.classList.contains("hidden")) continue;
      const rect = popover.getBoundingClientRect();
      const required = Math.ceil((rect.bottom - panelRect.top) / trayScale + 12);
      baseHeight = Math.max(baseHeight, required);
    }
    baseHeight = Math.min(470, baseHeight);
    try {
      await getCurrentWindow().setSize(new LogicalSize(
        Math.round(300 * trayScale),
        Math.round(baseHeight * trayScale),
      ));
    } catch {}
  });
}

function applyTrayScale(value) {
  trayScale = normalizedTrayScale(value);
  document.documentElement.style.setProperty("--tray-scale", String(trayScale));
  localStorage.setItem(TRAY_SCALE_KEY, String(trayScale));
  fitTrayHeight();
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
    return Array.isArray(value) ? [...new Set(value.filter(Boolean))].slice(0, MAX_SESSION_REMOTES) : [];
  } catch { return []; }
}

function saveSessionPeers(values) {
  const normalized = [...new Set(values.filter(Boolean))].slice(0, MAX_SESSION_REMOTES);
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
  fitTrayHeight();
}

function togglePopover(id) {
  const popover = $(id);
  if (!popover) return;
  const opening = popover.classList.contains("hidden");
  closePopovers(opening ? id : "");
  popover.classList.toggle("hidden", !opening);
  $("traySessionButton")?.setAttribute("aria-expanded", String(!$("traySessionPopover").classList.contains("hidden")));
  $("trayFavoritesButton")?.setAttribute("aria-expanded", String(!$("trayFavoritesPopover").classList.contains("hidden")));
  fitTrayHeight();
}

function renderPeerSelect() { return; }

function renderSession() {
  const box = $("traySessionMembers");
  box.innerHTML = "";

  if (activeRoom) {
    $("traySessionSummary").textContent = `${activeRoom.name} · ${activeRoom.participants}/${activeRoom.max_participants} · ${activeRoom.is_hosted_local ? t("group.hostedByYou") : `${t("group.hostedBy")} ${activeRoom.host_name || t("group.hostUnavailable")}`}`;
    $("traySessionCount").textContent = t("group.participantCount", { count: activeRoom.participants });
    const members = Array.isArray(activeRoom.members) ? activeRoom.members : [];
    if (!members.length) {
      box.innerHTML = `<div class="tray-empty">${t("group.none")}</div>`;
    } else {
      for (const member of members) {
        const row = document.createElement("div");
        row.className = "tray-member-row active";
        const role = member.host ? t("group.host") : (member.is_self ? t("group.you") : t("status.connected"));
        const secondary = member.is_self ? t("group.you") : (member.address || "LAN");
        row.innerHTML = `<span class="tray-member-dot"></span><span class="tray-member-copy"><strong>${escapeHtml(member.name || member.address || "DuoVoice")}</strong><small>${escapeHtml(secondary)}</small></span><span class="tray-member-state">${escapeHtml(role)}</span>`;
        box.appendChild(row);
      }
    }
    renderPeerSelect();
    fitTrayHeight();
    return;
  }

  if (communicationMode === "group") {
    const rooms = roomsCache.filter(room => room?.id);
    $("traySessionSummary").textContent = rooms.length ? `${rooms.length} ${t("group.roomsShort")}` : t("group.none");
    $("traySessionCount").textContent = `${rooms.length} ${t("group.roomsShort")}`;
    if (!rooms.length) {
      box.innerHTML = `<div class="tray-empty">${t("group.noRooms")}</div>`;
    } else {
      for (const room of rooms) {
        const full = room.participants >= room.max_participants;
        const row = document.createElement("button");
        row.type = "button";
        row.className = `tray-room-row${full ? " full" : ""}`;
        row.disabled = full;
        row.innerHTML = `<span class="tray-member-dot"></span><span class="tray-member-copy"><strong>${escapeHtml(room.name)}</strong><small>${escapeHtml(room.host_name || t("group.hostUnavailable"))}</small></span><span class="tray-member-state">${room.participants}/${room.max_participants}</span><span class="tray-room-action">${escapeHtml(full ? t("group.full") : t("group.join"))}</span>`;
        if (!full) row.addEventListener("click", event => { event.stopPropagation(); joinRoomFromTray(room.id); });
        box.appendChild(row);
      }
    }
    renderPeerSelect();
    fitTrayHeight();
    return;
  }

  const members = connected ? remotes.slice(0, 1) : [];
  const participantCount = members.length ? members.length + 1 : 1;
  const summary = !members.length
    ? t("group.none")
    : members.length === 1
      ? t("group.duoSummary", { count: participantCount })
      : t("group.groupSummary", { count: participantCount });
  $("traySessionSummary").textContent = summary;
  $("traySessionCount").textContent = t("group.participantCount", { count: members.length ? participantCount : 0 });

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
      box.appendChild(row);
    }
  }
  renderPeerSelect();
  fitTrayHeight();
}

function renderFavorites() {
  const favorites = favoriteItems().sort((a, b) => String(a.name || a.address).localeCompare(String(b.name || b.address)));
  $("trayFavoritesSummary").textContent = t("connection.favoritesCount", { count: favorites.length });
  $("trayFavoritesCount").textContent = t("connection.favoritesCount", { count: favorites.length });
  const box = $("trayFavoritesList");
  box.innerHTML = "";
  if (!favorites.length) {
    box.innerHTML = `<div class="tray-empty">${t("tray.noFavorites")}</div>`;
    fitTrayHeight();
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
    connectButton.disabled = communicationMode === "group" || !available || active;
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
  fitTrayHeight();
}

function updateStatus() {
  const status = $("trayStatus");
  const roomWaiting = Boolean(activeRoom) && !connected;
  status.className = `tray-status ${connected ? "online" : roomWaiting ? "waiting" : "offline"}`;
  status.innerHTML = `<i></i><span>${connected ? t("status.connected") : roomWaiting ? t("group.waiting") : t("status.offline")}</span>`;
  const sessionActive = connected || Boolean(activeRoom);
  $("quickConnectText").textContent = activeRoom ? t("group.leave") : (connected ? t("tray.quitSession") : t("tray.connection"));
  $("quickConnect").classList.toggle("disconnect", sessionActive);
  $("quickConnect").classList.toggle("primary", !sessionActive);
  renderSession();
  renderFavorites();
}

async function refreshState() {
  try {
    const previousRoomId = activeRoom?.id || null;
    communicationMode = localStorage.getItem(COMMUNICATION_MODE_KEY) === "group" ? "group" : "duo";
    const [state, room, rooms] = await Promise.all([
      invoke("audio_status"),
      invoke("get_local_room"),
      invoke("list_rooms"),
    ]);
    activeRoom = room || null;
    roomsCache = Array.isArray(rooms) ? rooms : [];
    connected = Boolean(state.connected);
    if (previousRoomId && !activeRoom && communicationMode === "group" && connected) {
      await invoke("stop_audio");
      connected = false;
      remotes = [];
      remote = "";
      await emit("audio-state-changed", { connected: false });
    }
    remotes = Array.isArray(state.remotes) ? state.remotes : (state.remote ? [state.remote] : []);
    remote = remotes[0] || "";
    if (connected && remotes.length && !activeRoom) saveSessionPeers(remotes);
    const muted = Boolean(state.muted);
    localStorage.setItem(MUTE_KEY, String(muted));
    $("quickMuteText").textContent = muted ? t("audio.unmute") : t("audio.mute");
    $("quickMute").classList.toggle("active", muted);
    if (activeRoom && communicationMode === "group") await syncRoomAudio();
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

function sameAddressSet(left, right) {
  const a = [...new Set(left || [])].sort();
  const b = [...new Set(right || [])].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

async function startRoomAudio(targets) {
  const normalized = [...new Set(targets.filter(Boolean))].slice(0, MAX_SESSION_REMOTES);
  if (!normalized.length) return false;
  const input = localStorage.getItem("duovoice.input") || null;
  const output = localStorage.getItem("duovoice.output") || null;
  await invoke("start_audio", { remote: normalized[0], remotes: normalized, input, output });
  const volume = Math.max(0, Math.min(2, Number(localStorage.getItem("duovoice.volume") ?? 100) / 100));
  await invoke("set_volume", { volume });
  connected = true;
  remotes = normalized;
  remote = normalized[0] || "";
  await emit("audio-state-changed", { connected: true, remotes: normalized });
  return true;
}

async function syncRoomAudio() {
  if (!activeRoom || roomSyncBusy) return;
  roomSyncBusy = true;
  try {
    const targets = (activeRoom.members || [])
      .filter(member => !member.is_self && member.address && member.address !== "127.0.0.1")
      .map(member => member.address)
      .slice(0, MAX_SESSION_REMOTES);

    if (!targets.length) {
      if (connected) {
        await invoke("stop_audio");
        connected = false;
        remotes = [];
        remote = "";
        await emit("audio-state-changed", { connected: false });
      }
      return;
    }

    if (!connected) {
      await startRoomAudio(targets);
    } else if (!sameAddressSet(remotes, targets)) {
      remotes = await invoke("set_audio_peers", { remotes: targets });
      remote = remotes[0] || "";
      await emit("audio-state-changed", { connected: true, remotes });
    }
  } catch (error) {
    invoke("log_client_error", { message: `Tray room sync: ${String(error)}` }).catch(() => {});
  } finally {
    roomSyncBusy = false;
  }
}

async function joinRoomFromTray(roomId) {
  if (!roomId || busy) return;
  busy = true;
  try {
    if (connected) {
      await invoke("stop_audio");
      connected = false;
      remotes = [];
      remote = "";
    }
    if (activeRoom) await invoke("leave_room");
    activeRoom = await invoke("join_room", { roomId });
    communicationMode = "group";
    localStorage.setItem(COMMUNICATION_MODE_KEY, "group");
    await syncRoomAudio();
    await emit("room-state-changed", { room: activeRoom });
    closePopovers();
    await refreshState();
  } catch (error) {
    invoke("log_client_error", { message: `Tray room join: ${String(error)}` }).catch(() => {});
  } finally {
    busy = false;
  }
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
  if (activeRoom) return;
  const address = $("trayPeer").value;
  if (!address) return;
  const base = new Set(configuredSessionPeers().length ? configuredSessionPeers() : remotes);
  if (base.size >= MAX_SESSION_REMOTES) return;
  base.add(address);
  try { await setLivePeers([...base]); } catch (error) { invoke("log_client_error", { message: `Tray group add: ${String(error)}` }).catch(() => {}); }
}

async function removeSessionPeer(address) {
  if (activeRoom) return;
  const base = new Set(configuredSessionPeers().length ? configuredSessionPeers() : remotes);
  base.delete(address);
  try { await setLivePeers([...base]); } catch (error) { invoke("log_client_error", { message: `Tray group remove: ${String(error)}` }).catch(() => {}); }
}

async function connectOrAddFavorite(address) {
  if (!address || activeRoom) return;
  try {
    if (connected) {
      const base = new Set(remotes);
      if (base.size >= MAX_SESSION_REMOTES) return;
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
  const normalized = [...new Set(targets.filter(Boolean))].slice(0, MAX_SESSION_REMOTES);
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
    if (communicationMode === "group" && !activeRoom) {
      togglePopover("traySessionPopover");
      return;
    }
    if (activeRoom) {
      await invoke("leave_room");
      if (connected) await invoke("stop_audio");
      activeRoom = null;
      connected = false;
      remotes = [];
      remote = "";
      saveSessionPeers([]);
      await emit("room-state-changed", { room: null });
      await emit("audio-state-changed");
    } else if (connected) {
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
  if (event.key === COMMUNICATION_MODE_KEY) {
    communicationMode = event.newValue === "group" ? "group" : "duo";
    refreshState();
  }
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
listen("room-state-changed", refreshState).catch(() => {});
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
fitTrayHeight();
