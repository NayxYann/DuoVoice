import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { normalizePreferences, validIPv4 } from "./linux-state.js";
import "./linux.css";

const strings = {
  fr: {
    subtitle:"Intercom sur le réseau local", main:"Connexion et audio", settings:"Paramètres", identity:"Cet ordinateur", name:"Nom de la machine", save:"Enregistrer", computers:"Ordinateurs distants", discoveryHelp:"Ouvre DuoVoice sur les deux ordinateurs, sur le même réseau.", refresh:"Actualiser", manualIp:"Adresse IPv4 manuelle", connect:"Connecter", disconnect:"Déconnecter", devices:"Périphériques audio", input:"Entrée — microphone", output:"Sortie — écouteurs / haut-parleurs", deviceHelp:"Les périphériques sont actualisés automatiquement. Les moniteurs de sortie sont masqués.", audio:"Réglages audio", mute:"Couper mon microphone", volume:"Volume reçu", boost:"Autoriser l’amplification jusqu’à 200 %", noise:"Réduction de bruit du microphone", intensity:"Intensité", appearance:"Interface", language:"Langue", themeHelp:"Le thème clair ou sombre suit les préférences du système.", startup:"Démarrage et fermeture", autostart:"Lancer DuoVoice à l’ouverture de session", startHidden:"Démarrer réduit dans le tray", trayEnabled:"Afficher l’icône dans le tray", closeToTray:"Fermer la fenêtre réduit DuoVoice dans le tray", trayHelp:"Sans tray disponible, la fenêtre reste accessible et sa fermeture quitte l’application.", about:"À propos", aboutText:"DuoVoice pour Linux · compatible avec DuoVoice Windows sur le réseau local.", updates:"Cette version n’intègre pas de mise à jour automatique. Remplace l’AppImage pour changer de version.", quit:"Quitter DuoVoice", idle:"Déconnecté", active:"Audio actif vers", empty:"Aucun ordinateur détecté. Vérifie que DuoVoice est ouvert à distance et que le pare-feu autorise le réseau local (UDP 39471 et 39472).", defaultDevice:"Périphérique par défaut", connected:"Actif", unavailable:"Un périphérique a été débranché ou le flux audio a échoué. La connexion a été arrêtée ; sélectionne un périphérique et reconnecte-toi.", invalidIp:"Saisis une adresse IPv4 valide, par exemple 192.168.1.20.", noTray:"Le tray n’est pas disponible dans cette session. La fenêtre restera accessible.", latency:"Latence", noResponse:"Le correspondant ne répond pas encore. Connecte également DuoVoice sur l’autre ordinateur.", noInput:"Aucun microphone détecté. Vérifie le profil audio dans les paramètres KDE.", storage:"Impossible d’enregistrer les réglages localement."
  },
  en: {
    subtitle:"Local network intercom", main:"Connection and audio", settings:"Settings", identity:"This computer", name:"Machine name", save:"Save", computers:"Remote computers", discoveryHelp:"Open DuoVoice on both computers, on the same network.", refresh:"Refresh", manualIp:"Manual IPv4 address", connect:"Connect", disconnect:"Disconnect", devices:"Audio devices", input:"Input — microphone", output:"Output — headphones / speakers", deviceHelp:"Devices refresh automatically. Output monitor sources are hidden.", audio:"Audio settings", mute:"Mute my microphone", volume:"Received volume", boost:"Allow amplification up to 200%", noise:"Microphone noise reduction", intensity:"Intensity", appearance:"Interface", language:"Language", themeHelp:"The light or dark theme follows your system preferences.", startup:"Startup and closing", autostart:"Launch DuoVoice at login", startHidden:"Start minimized to tray", trayEnabled:"Show the tray icon", closeToTray:"Closing the window minimizes DuoVoice to tray", trayHelp:"Without a working tray, the window stays accessible and closing it quits the application.", about:"About", aboutText:"DuoVoice for Linux · compatible with DuoVoice Windows on your local network.", updates:"This version has no automatic updater. Replace the AppImage to change versions.", quit:"Quit DuoVoice", idle:"Disconnected", active:"Audio active to", empty:"No computers detected. Open DuoVoice on the remote computer and allow local network traffic through the firewall (UDP 39471 and 39472).", defaultDevice:"Default device", connected:"Active", unavailable:"An audio device was disconnected or the audio stream failed. The connection has stopped; select a device and reconnect.", invalidIp:"Enter a valid IPv4 address, such as 192.168.1.20.", noTray:"The tray is unavailable in this session. The window will stay accessible.", latency:"Latency", noResponse:"The peer is not responding yet. Connect DuoVoice on the other computer too.", noInput:"No microphone found. Check the audio profile in KDE settings.", storage:"Unable to save settings locally."
  }
};
const $ = id => document.getElementById(id);
let saved;
try { saved = JSON.parse(localStorage.getItem("duovoice.linux.preferences") || "{}"); } catch { saved = {}; }
const prefs = normalizePreferences(saved);
let peers = [];
let remote = null;
let devices = { inputs:[], outputs:[] };
let busy = false;
let polling = false;
let trayAvailable = false;
let devicesRefreshAt = 0;
let connectionRevision = 0;
const t = key => strings[prefs.language][key] || key;
function message(text = "") { $("message").textContent = text; $("message").hidden = !text; }
function save() {
  try { localStorage.setItem("duovoice.linux.preferences",JSON.stringify(prefs)); }
  catch { message(t("storage")); }
}
function safe(action) {
  return async event => { try { await action(event); } catch(error) { message(String(error)); } };
}
function tab(settings) {
  $("mainPage").hidden = settings;
  $("settingsPage").hidden = !settings;
  $("mainTab").classList.toggle("active",!settings);
  $("settingsTab").classList.toggle("active",settings);
  $(settings ? "settingsTab" : "mainTab").focus();
}
function renderStatus() {
  $("status").textContent = remote ? `${t("active")} ${remote}` : t("idle");
  $("status").classList.toggle("connected",Boolean(remote));
  $("disconnect").disabled = !remote || busy;
  $("ipForm").querySelector("button").disabled = busy;
  for (const key of ["input","output"]) $(key).disabled = busy;
  if (!remote) $("latency").textContent = "";
}
function renderPeers() {
  const list = $("peers"); list.replaceChildren();
  const visible = peers.slice();
  if (remote && !visible.some(peer => peer.address === remote)) visible.push({name:remote,address:remote});
  if (!visible.length) {
    const item = document.createElement("li"); item.className = "empty"; item.textContent = t("empty"); list.append(item);
  }
  for (const peer of visible) {
    const item = document.createElement("li"); item.classList.toggle("selected",peer.address === remote);
    const label = document.createElement("div"); const name = document.createElement("strong"); const address = document.createElement("small");
    name.textContent = peer.name; address.textContent = peer.address; label.append(name,address);
    const button = document.createElement("button"); button.textContent = t(peer.address === remote ? "connected" : "connect"); button.className="primary";
    button.disabled = busy || peer.address === remote; button.addEventListener("click",safe(() => connect(peer.address))); item.append(label,button); list.append(item);
  }
}
function renderDevices() {
  for (const key of ["input","output"]) {
    const select = $(key); select.replaceChildren(new Option(t("defaultDevice"),""));
    for (const device of devices[key === "input" ? "inputs" : "outputs"]) select.add(new Option(device.name,device.id));
    select.value = prefs[key];
  }
}
function renderLanguage() {
  document.documentElement.lang = prefs.language;
  document.querySelectorAll("[data-i18n]").forEach(node => node.textContent = t(node.dataset.i18n));
  renderDevices(); renderPeers(); renderStatus();
}
async function applyAudio() {
  await invoke("set_volume",{volume:prefs.volume});
  await invoke("set_mute",{muted:prefs.muted});
  await invoke("set_noise_reduction",{enabled:prefs.noise,intensity:prefs.intensity});
}
async function connect(address) {
  if (!validIPv4(address)) throw new Error(t("invalidIp"));
  if (busy) return;
  connectionRevision++;
  busy = true; message(); renderPeers(); renderStatus();
  try {
    await invoke("start_audio",{remote:address,input:prefs.input || null,output:prefs.output || null});
    remote = address;
  } catch(error) { remote = null; throw error; }
  finally { busy = false; renderPeers(); renderStatus(); }
}
async function disconnect() {
  if (busy) return;
  connectionRevision++;
  await invoke("stop_audio"); remote = null; renderPeers(); renderStatus();
}
async function refreshDevices() {
  const revision = connectionRevision;
  const next = await invoke("list_linux_devices");
  if (busy || revision !== connectionRevision) return;
  let missing = false;
  for (const key of ["input","output"]) {
    if (prefs[key] && !next[key === "input" ? "inputs" : "outputs"].some(device => device.id === prefs[key])) {
      prefs[key] = ""; missing = true;
    }
  }
  if (missing && remote) { await disconnect(); message(t("unavailable")); }
  const changed = JSON.stringify(devices) !== JSON.stringify(next);
  devices = next;
  if (changed || missing) renderDevices();
  if (missing) save();
  devicesRefreshAt = Date.now();
}
async function refreshPeers() { peers = await invoke("list_peers"); renderPeers(); }
async function poll() {
  if (polling || busy) return;
  polling = true;
  const revision = connectionRevision;
  try {
    await refreshPeers();
    const status = await invoke("audio_status");
    if (busy || revision !== connectionRevision) return;
    if (status.connected && status.stream_failed) { await disconnect(); message(t("unavailable")); }
    else { remote = status.connected ? status.remote?.split(":")[0] : null; renderStatus(); }
    if (Date.now() - devicesRefreshAt > 10000) await refreshDevices();
    await refreshTrayAvailability();
    if (remote && !busy && revision === connectionRevision) {
      try { const value = await invoke("measure_latency"); if (busy || revision !== connectionRevision) return; $("latency").textContent = `${t("latency")} : ${Math.round(value)} ms`; }
      catch { if (!busy && revision === connectionRevision) $("latency").textContent = t("noResponse"); }
    }
  } catch(error) { message(String(error)); }
  finally { polling = false; }
}
async function refreshTrayAvailability() {
  const startup = await invoke("linux_startup");
  if (trayAvailable !== startup.tray_available) {
    trayAvailable = startup.tray_available;
    await invoke("set_close_action",{action:prefs.closeToTray && trayAvailable ? "tray" : "quit"});
    $("closeToTray").disabled = !trayAvailable;
    $("startHidden").disabled = !trayAvailable;
  }
}
async function configureTray() {
  trayAvailable = await invoke("configure_linux_tray",{enabled:prefs.trayEnabled,language:prefs.language});
  await invoke("set_close_action",{action:prefs.closeToTray && trayAvailable ? "tray" : "quit"});
  $("closeToTray").disabled = !trayAvailable;
  $("startHidden").disabled = !trayAvailable;
  if (prefs.trayEnabled && !trayAvailable) message(t("noTray"));
}
$("mainTab").onclick = () => tab(false); $("settingsTab").onclick = () => tab(true);
$("nameForm").addEventListener("submit",safe(async event => {
  event.preventDefault(); prefs.name = await invoke("set_client_name",{name:$("name").value}); $("name").value=prefs.name; save(); message();
}));
$("ipForm").addEventListener("submit",safe(async event => {
  event.preventDefault(); const address = $("ip").value.trim();
  if (!validIPv4(address)) throw new Error(t("invalidIp"));
  await invoke("add_manual_peer",{address}); prefs.ip=address; save(); await connect(address); await refreshPeers();
}));
$("refresh").addEventListener("click",safe(async () => { message(); await refreshPeers(); await refreshDevices(); }));
$("disconnect").addEventListener("click",safe(disconnect));
$("quit").addEventListener("click",safe(() => invoke("quit_app")));
for (const key of ["input","output"]) $(key).addEventListener("change",safe(async () => {
  const previous = prefs[key]; prefs[key]=$(key).value;
  try { if(remote) await connect(remote); save(); }
  catch(error) { prefs[key]=previous; renderDevices(); throw error; }
}));
$("mute").addEventListener("change",safe(async () => { prefs.muted=$("mute").checked; await invoke("set_mute",{muted:prefs.muted}); save(); }));
function renderAudio() {
  $("volume").max=prefs.boost ? "200" : "100";
  $("volume").value=String(Math.round(prefs.volume*100)); $("volumeValue").value=`${$("volume").value} %`;
  $("intensity").value=String(Math.round(prefs.intensity*100)); $("intensityValue").value=`${$("intensity").value} %`; $("intensity").disabled=!prefs.noise;
}
$("volume").addEventListener("input",safe(async () => { prefs.volume=Number($("volume").value)/100; renderAudio(); await invoke("set_volume",{volume:prefs.volume}); save(); }));
$("boost").addEventListener("change",safe(async () => { prefs.boost=$("boost").checked; if(!prefs.boost) prefs.volume=Math.min(1,prefs.volume); renderAudio(); await invoke("set_volume",{volume:prefs.volume}); save(); }));
for (const id of ["noise","intensity"]) $(id).addEventListener(id === "intensity" ? "input" : "change",safe(async () => {
  prefs.noise=$("noise").checked; prefs.intensity=Number($("intensity").value)/100; renderAudio(); await invoke("set_noise_reduction",{enabled:prefs.noise,intensity:prefs.intensity}); save();
}));
$("language").addEventListener("change",safe(async () => { prefs.language=$("language").value; save(); renderLanguage(); await configureTray(); }));
$("autostart").addEventListener("change",safe(async () => {
  try { if($("autostart").checked) await enable(); else await disable(); }
  catch(error) { $("autostart").checked = !$("autostart").checked; throw error; }
}));
for (const id of ["trayEnabled","closeToTray","startHidden"]) $(id).addEventListener("change",safe(async () => { prefs[id]=$(id).checked; save(); await configureTray(); }));

async function initialize() {
  for (const key of ["boost","noise","trayEnabled","closeToTray","startHidden"]) $(key).checked=prefs[key];
  $("mute").checked=prefs.muted; $("language").value=prefs.language; $("ip").value=prefs.ip;
  renderLanguage(); renderAudio();
  await listen("open-settings",() => tab(true)); await listen("open-main",() => tab(false));
  try { $("version").textContent=`v${await getVersion()}`; } catch { /* version is cosmetic */ }
  try {
    if(prefs.name) { try { prefs.name=await invoke("set_client_name",{name:prefs.name}); } catch { prefs.name=""; } }
    if(!prefs.name) prefs.name=await invoke("get_client_name"); $("name").value=prefs.name; save();
    await applyAudio(); await configureTray();
    $("autostart").checked=await isEnabled();
    const startup=await invoke("linux_startup");
    if(startup.autostart && prefs.startHidden && trayAvailable) await invoke("hide_window_to_tray");
  } catch(error) { message(String(error)); }
  try { await refreshDevices(); if(!devices.inputs.length) message(t("noInput")); } catch(error) { message(String(error)); }
  await poll(); setInterval(poll,3000);
}
initialize().catch(error => message(String(error)));
