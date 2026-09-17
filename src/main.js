import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { enable as enableAutostart, disable as disableAutostart, isEnabled as isAutostartEnabled } from "@tauri-apps/plugin-autostart";
import "./style.css";

const $ = (id) => document.getElementById(id);
let connected = false;
const peerCache = new Map();
const MANUAL_KEY = "duovoice.manualIps";
const VOLUME_KEY = "duovoice.volume";
const BOOST_KEY = "duovoice.boostVolume";
const MUTE_KEY = "duovoice.muted";

function setDetails(text) { $("details").textContent = text; }

function showSettings() {
  $("mainView").classList.add("hidden");
  $("settingsView").classList.remove("hidden");
}

function showMain() {
  $("settingsView").classList.add("hidden");
  $("mainView").classList.remove("hidden");
}

function renderPeers(preferred = "") {
  const select = $("peer");
  const current = preferred || select.value;
  select.innerHTML = "";
  const list = [...peerCache.values()].sort((a,b) => a.name.localeCompare(b.name));
  if (!list.length) select.add(new Option("Aucun PC détecté — ajoutez une IP", ""));
  for (const p of list) select.add(new Option(`${p.name} — ${p.address}`, p.address));
  if (current && [...select.options].some(o => o.value === current)) select.value = current;
}

async function loadAutostart() {
  try { $("autostart").checked = await isAutostartEnabled(); }
  catch (e) { $("autostartDetails").textContent = `Autostart indisponible : ${e}`; }
}

function loadAudioPreferences() {
  const savedVolume = Math.max(0, Math.min(200, Number(localStorage.getItem(VOLUME_KEY) ?? 100)));
  const boost = localStorage.getItem(BOOST_KEY) === "true";
  $("boostVolume").checked = boost;
  $("volume").value = boost ? savedVolume : Math.min(savedVolume, 100);
  updateVolumeUi();
  updateMuteUi(localStorage.getItem(MUTE_KEY) === "true");
}

function updateVolumeUi() {
  const value = Number($("volume").value);
  $("volumeValue").textContent = `${value}%`;
  $("savedVolume").textContent = `${value}%`;
}

async function applyVolume() {
  const volume = Number($("volume").value) / 100;
  try { await invoke("set_volume", { volume }); }
  catch (e) { setDetails(`Volume : ${e}`); }
}

function updateMuteUi(muted) {
  $("muteText").textContent = muted ? "Réactiver le son" : "Muet";
  $("mute").classList.toggle("active", muted);
  $("mute").querySelector(".mute-icon").textContent = muted ? "🔇" : "🎙";
}

async function loadDevices() {
  try {
    const devices = await invoke("list_devices");
    const input = $("input"), output = $("output");
    input.innerHTML = ""; output.innerHTML = "";
    for (const d of devices.inputs) input.add(new Option(d, d));
    for (const d of devices.outputs) output.add(new Option(d, d));
    const savedInput = localStorage.getItem("duovoice.input");
    const savedOutput = localStorage.getItem("duovoice.output");
    if (savedInput && [...input.options].some(o => o.value === savedInput)) input.value = savedInput;
    if (savedOutput && [...output.options].some(o => o.value === savedOutput)) output.value = savedOutput;
  } catch (e) { setDetails(`Audio indisponible : ${e}`); }
}

async function loadPeers(manual = false) {
  const refresh = $("refresh");
  if (manual) { refresh.disabled = true; refresh.textContent = "…"; setDetails("Recherche des ordinateurs…"); }
  try {
    const peers = await invoke("list_peers");
    const now = Date.now();
    for (const p of peers) {
      const old = peerCache.get(p.address);
      peerCache.set(p.address, { ...p, seenAt: now, manual: old?.manual ?? false });
    }
    for (const [address, p] of peerCache) if (!p.manual && now - p.seenAt > 15000) peerCache.delete(address);
    renderPeers();
    if (manual) setDetails(peers.length ? `${peers.length} ordinateur(s) disponible(s).` : "Aucun PC détecté. Vous pouvez ajouter une IP manuellement.");
  } catch (e) { setDetails(`Détection réseau : ${e}`); }
  finally { if (manual) { refresh.disabled = false; refresh.textContent = "↻"; } }
}

function loadManualIps() {
  try {
    const ips = JSON.parse(localStorage.getItem(MANUAL_KEY) || "[]");
    for (const address of ips) {
      peerCache.set(address, { name: `PC — ${address}`, address, port: 39472, seenAt: Date.now(), manual: true });
    }
  } catch {}
}

async function addManualIp() {
  const address = $("manualIp").value.trim();
  if (!address) return;
  try {
    const p = await invoke("add_manual_peer", { address });
    peerCache.set(p.address, { ...p, manual: true, seenAt: Date.now() });
    const ips = new Set(JSON.parse(localStorage.getItem(MANUAL_KEY) || "[]"));
    ips.add(p.address); localStorage.setItem(MANUAL_KEY, JSON.stringify([...ips]));
    renderPeers(p.address); $("manualIp").value = ""; setDetails(`IP ${p.address} ajoutée.`);
  } catch (e) { setDetails(`IP invalide : ${e}`); }
}

async function connect() {
  const peer = $("peer").value;
  if (!peer) { setDetails("Sélectionnez un ordinateur ou ajoutez une IP."); return; }
  const button = $("connect"); button.disabled = true;
  try {
    if (!connected) {
      setDetails(`Connexion à ${peer}…`);
      await invoke("start_audio", { remote: peer, input: $("input").value || null, output: $("output").value || null });
      await applyVolume();
      connected = true;
      button.textContent = "Se déconnecter";
      $("status").innerHTML = '<span class="status-dot"></span>Connecté';
      $("status").className = "status online";
      setDetails("Audio bidirectionnel actif.");
    } else {
      await invoke("stop_audio");
      connected = false;
      button.textContent = "Se connecter";
      $("status").innerHTML = '<span class="status-dot"></span>Hors ligne';
      $("status").className = "status offline";
      setDetails("Déconnecté.");
    }
  } catch (e) { setDetails(`Connexion impossible : ${e}`); }
  finally { button.disabled = false; }
}

$("connect").addEventListener("click", connect);
$("refresh").addEventListener("click", () => loadPeers(true));
$("addIp").addEventListener("click", addManualIp);
$("manualIp").addEventListener("keydown", e => { if (e.key === "Enter") addManualIp(); });

$("volume").addEventListener("input", () => {
  if (!$("boostVolume").checked && Number($("volume").value) > 100) $("volume").value = 100;
  updateVolumeUi();
  localStorage.setItem(VOLUME_KEY, $("volume").value);
  applyVolume();
});

$("boostVolume").addEventListener("change", () => {
  const enabled = $("boostVolume").checked;
  localStorage.setItem(BOOST_KEY, String(enabled));
  if (!enabled && Number($("volume").value) > 100) $("volume").value = 100;
  updateVolumeUi();
  localStorage.setItem(VOLUME_KEY, $("volume").value);
  applyVolume();
});

$("mute").addEventListener("click", async () => {
  try {
    const muted = await invoke("toggle_mute");
    localStorage.setItem(MUTE_KEY, String(muted));
    updateMuteUi(muted);
  } catch (e) { setDetails(`Muet : ${e}`); }
});

$("input").addEventListener("change", () => localStorage.setItem("duovoice.input", $("input").value));
$("output").addEventListener("change", () => localStorage.setItem("duovoice.output", $("output").value));

$("settingsBtn").addEventListener("click", showSettings);
$("backBtn").addEventListener("click", showMain);

$("autostart").addEventListener("change", async e => {
  try {
    if (e.target.checked) await enableAutostart(); else await disableAutostart();
    $("autostartDetails").textContent = e.target.checked ? "Démarrage automatique activé." : "Démarrage automatique désactivé.";
  } catch (err) {
    e.target.checked = await isAutostartEnabled().catch(() => false);
    $("autostartDetails").textContent = `Impossible de modifier l'autostart : ${err}`;
  }
});

$("startHidden").checked = localStorage.getItem("duovoice.startHidden") !== "false";
$("closeAction").value = localStorage.getItem("duovoice.closeAction") || "tray";
$("startHidden").addEventListener("change", () => localStorage.setItem("duovoice.startHidden", String($("startHidden").checked)));
$("closeAction").addEventListener("change", async () => {
  const value = $("closeAction").value;
  localStorage.setItem("duovoice.closeAction", value);
  try { await invoke("set_close_action", { action: value }); }
  catch (e) { setDetails(`Réglage fermeture : ${e}`); }
});

listen("open-settings", showSettings).catch(() => {});

loadManualIps();
loadDevices();
loadAutostart();
loadAudioPreferences();
loadPeers();
setInterval(() => loadPeers(false), 3000);
