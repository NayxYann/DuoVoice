import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit, listen } from "@tauri-apps/api/event";
import "./tray.css";

const $ = (id) => document.getElementById(id);
const COLOR_KEY = "duovoice.color";
const MUTE_KEY = "duovoice.muted";
const FAVORITES_KEY = "duovoice.favorites";
const PALETTE = { violet: "#a78bfa", rose: "#f472b6", bleu: "#60a5fa", vert: "#4ade80", jaune: "#facc15", orange: "#fb923c", cyan: "#22d3ee", ardoise: "#94a3b8" };
let peers = [];
let connected = false;
let remote = "";
let busy = false;

function applyColor(name) {
  const color = PALETTE[name] || PALETTE.violet;
  document.documentElement.style.setProperty("--accent", color);
  document.documentElement.style.setProperty("--accent-soft", `${color}22`);
}

function favoriteAddresses() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]").map(item => item.address).filter(Boolean);
  } catch { return []; }
}

function renderPeers() {
  const select = $("trayPeer");
  const selected = select.value;
  select.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = connected ? "Changer de correspondant…" : "Choisir un PC…";
  select.appendChild(placeholder);

  const favs = favoriteAddresses();
  const ordered = [...peers].sort((a,b) => (favs.includes(a.address) ? -1 : 0) - (favs.includes(b.address) ? -1 : 0));
  for (const peer of ordered) {
    const option = document.createElement("option");
    option.value = peer.address;
    option.textContent = `${peer.name} · ${peer.address}`;
    select.appendChild(option);
  }
  if (peers.some(p => p.address === selected)) select.value = selected;
}

function updateStatus(status) {
  const el = $("trayStatus");
  el.className = `tray-status ${connected ? "online" : "offline"}`;
  el.innerHTML = `<i></i>${connected ? "Connecté" : "Hors ligne"}`;
  const peer = peers.find(p => p.address === remote);
  $("trayPeerName").textContent = peer ? peer.name : (remote || "Aucun correspondant");
  $("quickConnectText").textContent = connected ? "Déconnecter" : "Se connecter";
  $("quickConnect").classList.toggle("danger-tile", connected);
  $("quickConnect").classList.toggle("accent-tile", !connected);
}

async function refreshState() {
  try {
    const state = await invoke("audio_status");
    connected = Boolean(state.connected);
    remote = state.remote || "";
    const muted = Boolean(state.muted);
    localStorage.setItem(MUTE_KEY, String(muted));
    $("quickMuteText").textContent = muted ? "Réactiver" : "Muet";
    $("quickMute").classList.toggle("active-tile", muted);
    updateStatus();
  } catch {}
}

async function refreshPeers() {
  try { peers = await invoke("list_peers"); renderPeers(); updateStatus(); } catch {}
}

async function connectSelected() {
  if (busy) return;
  busy = true;
  try {
    if (connected) {
      await invoke("stop_audio");
      connected = false; remote = "";
    } else {
      const address = $("trayPeer").value || favoriteAddresses()[0] || peers[0]?.address;
      if (!address) {
        await refreshPeers();
        $("trayPeer").focus();
        return;
      }
      const input = localStorage.getItem("duovoice.input") || null;
      const output = localStorage.getItem("duovoice.output") || null;
      await invoke("start_audio", { remote: address, input, output });
      connected = true; remote = address;
    }
    await emit("audio-state-changed");
    await refreshState();
  } catch (e) {
    $("trayPeerName").textContent = `Erreur : ${e}`;
  } finally { busy = false; }
}

async function toggleMute() {
  try {
    const muted = await invoke("toggle_mute");
    localStorage.setItem(MUTE_KEY, String(muted));
    $("quickMuteText").textContent = muted ? "Réactiver" : "Muet";
    $("quickMute").classList.toggle("active-tile", muted);
    await emit("audio-state-changed");
  } catch (e) { $("trayPeerName").textContent = `Muet : ${e}`; }
}

async function openMain(settings = false) {
  await emit(settings ? "tray-open-settings" : "tray-open-main");
  await getCurrentWindow().hide();
}

$("trayPeer").addEventListener("change", async () => {
  if ($("trayPeer").value && !connected) await connectSelected();
});
$("quickConnect").addEventListener("click", connectSelected);
$("quickMute").addEventListener("click", toggleMute);
$("openApp").addEventListener("click", () => openMain(false));
$("openSettings").addEventListener("click", () => openMain(true));
$("closeTray").addEventListener("click", () => getCurrentWindow().hide());
$("quitTray").addEventListener("click", () => invoke("quit_app"));

window.addEventListener("storage", (event) => {
  if (event.key === COLOR_KEY) applyColor(event.newValue || "violet");
});
listen("theme-changed", (event) => applyColor(event.payload?.color || "violet")).catch(() => {});

applyColor(localStorage.getItem(COLOR_KEY) || "violet");
refreshPeers();
refreshState();
setInterval(refreshPeers, 3000);
setInterval(refreshState, 1500);
