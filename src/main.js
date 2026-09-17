import { invoke } from "@tauri-apps/api/core";
import { enable as enableAutostart, disable as disableAutostart, isEnabled as isAutostartEnabled } from "@tauri-apps/plugin-autostart";
import "./style.css";

const $ = (id) => document.getElementById(id);
let connected = false;
const peerCache = new Map();
const MANUAL_KEY = "duovoice.manualIps";

function setDetails(text) { $("details").textContent = text; }
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
    for (const p of peers) peerCache.set(p.address, { ...p, seenAt: now });
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
      connected = true; button.textContent = "Se déconnecter"; $("status").textContent = "Connecté"; $("status").className = "status online"; setDetails("Audio bidirectionnel actif.");
    } else {
      await invoke("stop_audio");
      connected = false; button.textContent = "Se connecter"; $("status").textContent = "Hors ligne"; $("status").className = "status offline"; setDetails("Déconnecté.");
    }
  } catch (e) { setDetails(`Connexion impossible : ${e}`); }
  finally { button.disabled = false; }
}

$("connect").addEventListener("click", connect);
$("refresh").addEventListener("click", () => loadPeers(true));
$("addIp").addEventListener("click", addManualIp);
$("manualIp").addEventListener("keydown", e => { if (e.key === "Enter") addManualIp(); });
$("volume").addEventListener("input", async e => { $("volumeValue").textContent = `${e.target.value}%`; if (connected) await invoke("set_volume", { volume: Number(e.target.value) / 100 }); });
$("mute").addEventListener("click", async () => { if (!connected) return; const muted = await invoke("toggle_mute"); $("mute").textContent = muted ? "🔇 Unmute" : "🎙️ Mute"; });
$("input").addEventListener("change", () => localStorage.setItem("duovoice.input", $("input").value));
$("output").addEventListener("change", () => localStorage.setItem("duovoice.output", $("output").value));

$("settingsBtn").addEventListener("click", () => { $("mainView").classList.add("hidden"); $("settingsView").classList.remove("hidden"); });
$("backBtn").addEventListener("click", () => { $("settingsView").classList.add("hidden"); $("mainView").classList.remove("hidden"); });
$("autostart").addEventListener("change", async e => { try { if (e.target.checked) await enableAutostart(); else await disableAutostart(); $("autostartDetails").textContent = e.target.checked ? "Démarrage automatique activé." : "Démarrage automatique désactivé."; } catch (err) { e.target.checked = await isAutostartEnabled().catch(() => false); $("autostartDetails").textContent = `Impossible de modifier l'autostart : ${err}`; } });
$("startHidden").checked = localStorage.getItem("duovoice.startHidden") !== "false";
$("closeAction").value = localStorage.getItem("duovoice.closeAction") || "tray";
$("startHidden").addEventListener("change", () => localStorage.setItem("duovoice.startHidden", String($("startHidden").checked)));
$("closeAction").addEventListener("change", async () => { const value = $("closeAction").value; localStorage.setItem("duovoice.closeAction", value); try { await invoke("set_close_action", { action: value }); } catch (e) { setDetails(`Réglage fermeture : ${e}`); } });

loadManualIps(); loadDevices(); loadAutostart(); loadPeers(); setInterval(() => loadPeers(false), 3000);
