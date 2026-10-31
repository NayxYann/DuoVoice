import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { normalizePreferences, validIPv4 } from "./linux-state.js";
import { createStartupFavorites } from "./startup-favorites.js";
import "./linux.css";

const strings = {
  fr: {
    subtitle:"Intercom sur le réseau local", main:"Connexion et audio", settings:"Paramètres", identity:"Cet ordinateur", name:"Nom de la machine", save:"Enregistrer", computers:"Ordinateurs distants", favorites:"Favoris", addFavorite:"Ajouter aux favoris", removeFavorite:"Retirer des favoris", discoveryHelp:"Ouvre DuoVoice sur les deux ordinateurs, sur le même réseau.", refresh:"Actualiser", manualIp:"Adresse IPv4 manuelle", connect:"Connecter", disconnect:"Déconnecter", devices:"Périphériques audio", input:"Entrée — microphone", output:"Sortie — écouteurs / haut-parleurs", deviceHelp:"Les périphériques sont actualisés automatiquement. Les moniteurs de sortie sont masqués.", audio:"Réglages audio", mute:"Couper mon microphone", volume:"Volume reçu", boost:"Autoriser l’amplification jusqu’à 200 %", noise:"Réduction de bruit du microphone", intensity:"Intensité", appearance:"Interface", language:"Langue", themeHelp:"Le thème clair ou sombre suit les préférences du système.", startup:"Démarrage et fermeture", autostart:"Lancer DuoVoice à l’ouverture de session", autoConnectFavorites:"Se connecter automatiquement à un favori", autoConnectHelp:"Au démarrage, DuoVoice se connecte au premier favori détecté dans l’ordre de la liste. Une seule connexion est lancée.", startHidden:"Démarrer réduit dans le tray", trayEnabled:"Afficher l’icône dans le tray", closeToTray:"Fermer la fenêtre réduit DuoVoice dans le tray", trayHelp:"Sans tray disponible, la fenêtre reste accessible et sa fermeture quitte l’application.", about:"À propos", aboutText:"DuoVoice pour Linux · compatible avec DuoVoice Windows sur le réseau local.", updates:"Cette version n’intègre pas de mise à jour automatique. Remplace l’AppImage pour changer de version.", quit:"Quitter DuoVoice", idle:"Déconnecté", active:"Audio actif vers", empty:"Aucun ordinateur détecté. Vérifie que DuoVoice est ouvert à distance et que le pare-feu autorise le réseau local (UDP 39471 et 39472).", defaultDevice:"Périphérique par défaut", connected:"Actif", unavailable:"Un périphérique a été débranché ou le flux audio a échoué. La connexion a été arrêtée ; sélectionne un périphérique et reconnecte-toi.", invalidIp:"Saisis une adresse IPv4 valide, par exemple 192.168.1.20.", noTray:"Le tray n’est pas disponible dans cette session. La fenêtre restera accessible.", latency:"Latence", noResponse:"Le correspondant ne répond pas encore. Connecte également DuoVoice sur l’autre ordinateur.", noInput:"Aucun microphone détecté. Vérifie le profil audio dans les paramètres KDE.", micPackets:"Aucun paquet ne part du microphone. Vérifie le périphérique d’entrée et son profil audio.", sendFailed:"L’envoi UDP audio échoue. Vérifie le réseau et le pare-feu local.", noIncoming:"Aucun paquet audio reçu. Vérifie que le pare-feu des deux PC autorise UDP 39472.", audioFlow:"Les paquets audio circulent dans les deux sens, mais aucun son audible ne peut être confirmé.", storage:"Impossible d’enregistrer les réglages localement."
  },
  en: {
    subtitle:"Local network intercom", main:"Connection and audio", settings:"Settings", identity:"This computer", name:"Machine name", save:"Save", computers:"Remote computers", favorites:"Favorites", addFavorite:"Add to favorites", removeFavorite:"Remove from favorites", discoveryHelp:"Open DuoVoice on both computers, on the same network.", refresh:"Refresh", manualIp:"Manual IPv4 address", connect:"Connect", disconnect:"Disconnect", devices:"Audio devices", input:"Input — microphone", output:"Output — headphones / speakers", deviceHelp:"Devices refresh automatically. Output monitor sources are hidden.", audio:"Audio settings", mute:"Mute my microphone", volume:"Received volume", boost:"Allow amplification up to 200%", noise:"Microphone noise reduction", intensity:"Intensity", appearance:"Interface", language:"Language", themeHelp:"The light or dark theme follows your system preferences.", startup:"Startup and closing", autostart:"Launch DuoVoice at login", autoConnectFavorites:"Automatically connect to a favorite", autoConnectHelp:"At startup, DuoVoice connects to the first discovered favorite in list order. Only one connection is started.", startHidden:"Start minimized to tray", trayEnabled:"Show the tray icon", closeToTray:"Closing the window minimizes DuoVoice to tray", trayHelp:"Without a working tray, the window stays accessible and closing it quits the application.", about:"About", aboutText:"DuoVoice for Linux · compatible with DuoVoice Windows on your local network.", updates:"This version has no automatic updater. Replace the AppImage to change versions.", quit:"Quit DuoVoice", idle:"Disconnected", active:"Audio active to", empty:"No computers detected. Open DuoVoice on the remote computer and allow local network traffic through the firewall (UDP 39471 and 39472).", defaultDevice:"Default device", connected:"Active", unavailable:"An audio device was disconnected or the audio stream failed. The connection has stopped; select a device and reconnect.", invalidIp:"Enter a valid IPv4 address, such as 192.168.1.20.", noTray:"The tray is unavailable in this session. The window will stay accessible.", latency:"Latency", noResponse:"The peer is not responding yet. Connect DuoVoice on the other computer too.", noInput:"No microphone found. Check the audio profile in KDE settings.", micPackets:"No packets are being sent from the microphone. Check the input device and audio profile.", sendFailed:"UDP audio sends are failing. Check the network and local firewall.", noIncoming:"No audio packets are arriving. Check that both PCs' firewalls allow UDP 39472.", audioFlow:"Audio packets are flowing in both directions, but audible output cannot be confirmed.", storage:"Unable to save settings locally."
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
let trayConfiguredAt = Date.now();
let devicesRefreshAt = 0;
let connectionRevision = 0;
let connectedAt = null;
let startupFavorites = null;
let trayConnectionSignature = "";
const t = key => strings[prefs.language][key] || key;
function message(text = "") { $("message").textContent = text; $("message").hidden = !text; }
function save() {
  try { localStorage.setItem("duovoice.linux.preferences",JSON.stringify(prefs)); }
  catch { message(t("storage")); }
}
function updateTrayConnectionMenu(force = false) {
  const signature = `${Boolean(remote)}|${Boolean(prefs.lastRemote)}|${prefs.language}`;
  if (!force && signature === trayConnectionSignature) return;
  trayConnectionSignature = signature;
  invoke("set_linux_tray_connection",{
    connected:Boolean(remote),hasLastConnection:Boolean(prefs.lastRemote),language:prefs.language
  }).catch(() => {});
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
    const actions = document.createElement("div"); actions.className = "peer-actions";
    const favorite = document.createElement("button");
    const isFavorite = prefs.favorites.some(item => item.address === peer.address);
    favorite.className = "favorite-toggle"; favorite.textContent = isFavorite ? "★" : "☆";
    favorite.title = t(isFavorite ? "removeFavorite" : "addFavorite"); favorite.setAttribute("aria-label",favorite.title);
    favorite.addEventListener("click",() => toggleFavorite(peer));
    const button = document.createElement("button"); button.textContent = t(peer.address === remote ? "connected" : "connect"); button.className="primary";
    button.disabled = busy || peer.address === remote; button.addEventListener("click",safe(() => connect(peer.address)));
    actions.append(favorite,button); item.append(label,actions); list.append(item);
  }
  renderFavorites();
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
async function connect(address,{automatic=false}={}) {
  if (!validIPv4(address)) throw new Error(t("invalidIp"));
  if (!automatic) startupFavorites?.stop();
  if (busy) return null;
  connectionRevision++;
  busy = true; message(); renderPeers(); renderStatus();
  try {
    const started = await invoke("start_audio",{remote:address,input:prefs.input || null,output:prefs.output || null,automatic});
    if (automatic && started !== true) return started;
    remote = address;
    prefs.lastRemote = address; save();
    connectedAt = Date.now();
    updateTrayConnectionMenu();
    return true;
  } catch(error) { remote = null; connectedAt = null; updateTrayConnectionMenu(); throw error; }
  finally { busy = false; renderPeers(); renderStatus(); }
}
async function disconnect(manual = true) {
  if (busy) return;
  if (manual) startupFavorites?.stop();
  connectionRevision++;
  busy = true; renderPeers(); renderStatus();
  try { await invoke("stop_audio"); remote = null; connectedAt = null; $("audioHealth").hidden = true; updateTrayConnectionMenu(); }
  finally { busy = false; renderPeers(); renderStatus(); }
}
async function refreshDevices({quiet = false} = {}) {
  const revision = connectionRevision;
  let next;
  try { next = await invoke("list_linux_devices"); }
  catch(error) {
    // PipeWire-Pulse may restart while an existing CPAL stream keeps playing.
    // Keep the last device list and retry on the next poll instead of showing a false audio failure.
    if (quiet) {
      devicesRefreshAt = Date.now();
      invoke("log_client_error",{message:`Temporary PulseAudio-compatible device enumeration failure: ${String(error)}`}).catch(() => {});
      return;
    }
    throw error;
  }
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
async function refreshPeers() {
  peers = await invoke("list_peers");
  for (const peer of peers) {
    const favorite = prefs.favorites.find(item => item.address === peer.address);
    if (favorite && favorite.name !== peer.name) favorite.name = peer.name;
  }
  renderPeers();
}
function toggleFavorite(peer) {
  const index = prefs.favorites.findIndex(item => item.address === peer.address);
  if (index >= 0) prefs.favorites.splice(index,1);
  else prefs.favorites.push({address:peer.address,name:peer.name});
  save(); renderPeers();
}
function renderFavorites() {
  const list = $("favorites"); if (!list) return;
  list.replaceChildren();
  if (!prefs.favorites.length) {
    const item=document.createElement("li"); item.className="empty";
    item.textContent=prefs.language === "fr" ? "Aucun favori. Utilise l’étoile d’un ordinateur détecté." : "No favorites yet. Use the star next to a detected computer.";
    list.append(item); return;
  }
  for (const favorite of prefs.favorites) {
    const item=document.createElement("li"); const label=document.createElement("span");
    label.textContent=favorite.name; const address=document.createElement("small"); address.textContent=favorite.address; label.append(address);
    const actions=document.createElement("div"); actions.className="peer-actions";
    const connectButton=document.createElement("button"); connectButton.textContent=t("connect"); connectButton.className="primary";
    connectButton.disabled=busy || remote===favorite.address || !peers.some(peer=>peer.address===favorite.address);
    connectButton.addEventListener("click",safe(()=>connect(favorite.address)));
    const remove=document.createElement("button"); remove.textContent="★"; remove.className="favorite-toggle"; remove.title=t("removeFavorite"); remove.setAttribute("aria-label",remove.title);
    remove.addEventListener("click",()=>toggleFavorite(favorite)); actions.append(connectButton,remove); item.append(label,actions); list.append(item);
  }
}
function resetStartupFavorites() {
  startupFavorites?.stop();
  startupFavorites=createStartupFavorites({
    enabled:()=>prefs.autoConnectFavorites,
    favorites:()=>prefs.favorites,
    discover:()=>invoke("list_startup_peers"),
    connect:address=>connect(address,{automatic:true}),
    onError:(error,exhausted)=>{ if(exhausted) message(String(error)); },
  });
}
function updateAudioHealth(status) {
  const health=$("audioHealth");
  if (!remote || !status.diagnostics || !connectedAt || Date.now()-connectedAt<5000) { health.hidden=true; return; }
  const diagnostics=status.diagnostics;
  health.hidden=false;
  if (diagnostics.send_failures>0 && diagnostics.sent_packets===0) health.textContent=t("sendFailed");
  else if (diagnostics.sent_packets===0) health.textContent=t("micPackets");
  else if (diagnostics.received_packets===0) health.textContent=t("noIncoming");
  else health.textContent=`${t("audioFlow")} (${diagnostics.sent_packets} ${prefs.language === "fr" ? "envoyés" : "sent"}, ${diagnostics.received_packets} ${prefs.language === "fr" ? "reçus" : "received"}; ${diagnostics.buffer_ms} ms, ${diagnostics.playback_underruns} ${prefs.language === "fr" ? "coupures" : "underruns"})`;
}
async function poll() {
  if (polling || busy) return;
  polling = true;
  const revision = connectionRevision;
  try {
    await refreshPeers();
    const status = await invoke("audio_status");
    if (busy || revision !== connectionRevision) return;
    if (status.connected && status.stream_failed) { await disconnect(false); message(t("unavailable")); }
    else {
      if(status.connected && !connectedAt) connectedAt=Date.now();
      if(!status.connected) connectedAt=null;
      remote = status.connected ? status.remote?.split(":")[0] : null; renderStatus(); updateAudioHealth(status);
      updateTrayConnectionMenu();
    }
    if (Date.now() - devicesRefreshAt > 10000) await refreshDevices({quiet:true});
    await refreshTrayAvailability();
    if (remote && !busy && revision === connectionRevision) {
      try { const value = await invoke("measure_latency"); if (busy || revision !== connectionRevision) return; $("latency").textContent = `${t("latency")} : ${Math.round(value)} ms`; }
      catch { if (!busy && revision === connectionRevision) $("latency").textContent = t("noResponse"); }
    }
    if (startupFavorites?.active && !remote && !busy) await startupFavorites.tick();
  } catch(error) { message(String(error)); }
  finally { polling = false; }
}
async function refreshTrayAvailability() {
  const startup = await invoke("linux_startup");
  if (startup.tray_available) {
    if ($("message").textContent === t("noTray")) message();
  } else if (prefs.trayEnabled && Date.now() - trayConfiguredAt > 8000) {
    message(t("noTray"));
  }
  if (trayAvailable !== startup.tray_available) {
    trayAvailable = startup.tray_available;
    await invoke("set_close_action",{action:prefs.closeToTray && trayAvailable ? "tray" : "quit"});
    $("closeToTray").disabled = !trayAvailable;
    $("startHidden").disabled = !trayAvailable;
  }
}
async function configureTray() {
  trayConfiguredAt = Date.now();
  trayAvailable = await invoke("configure_linux_tray",{enabled:prefs.trayEnabled,language:prefs.language});
  await invoke("set_close_action",{action:prefs.closeToTray && trayAvailable ? "tray" : "quit"});
  $("closeToTray").disabled = !trayAvailable;
  $("startHidden").disabled = !trayAvailable;
  updateTrayConnectionMenu(true);
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
  try { await invoke("set_linux_autostart",{enabled:$("autostart").checked,startHidden:prefs.startHidden}); }
  catch(error) { $("autostart").checked = !$("autostart").checked; throw error; }
}));
$("autoConnectFavorites").addEventListener("change",()=>{prefs.autoConnectFavorites=$("autoConnectFavorites").checked;save();resetStartupFavorites();});
for (const id of ["trayEnabled","closeToTray","startHidden"]) $(id).addEventListener("change",safe(async () => {
  prefs[id]=$(id).checked; save();
  if(id === "startHidden" && $("autostart").checked) await invoke("set_linux_autostart",{enabled:true,startHidden:prefs.startHidden});
  await configureTray();
}));

async function initialize() {
  try { document.documentElement.dataset.desktop = await invoke("linux_desktop"); }
  catch { document.documentElement.dataset.desktop = "generic"; }
  for (const key of ["boost","noise","trayEnabled","closeToTray","startHidden","autoConnectFavorites"]) $(key).checked=prefs[key];
  resetStartupFavorites();
  $("mute").checked=prefs.muted; $("language").value=prefs.language; $("ip").value=prefs.ip;
  renderLanguage(); renderAudio();
  await listen("open-settings",() => tab(true)); await listen("open-main",() => tab(false));
  await listen("tray-toggle-last-connection",safe(async () => {
    if(remote) await disconnect();
    else if(prefs.lastRemote) await connect(prefs.lastRemote);
  }));
  try { $("version").textContent=`v${await getVersion()}`; } catch { /* version is cosmetic */ }
  try {
    if(prefs.name) { try { prefs.name=await invoke("set_client_name",{name:prefs.name}); } catch { prefs.name=""; } }
    if(!prefs.name) prefs.name=await invoke("get_client_name"); $("name").value=prefs.name; save();
    await applyAudio();
    try { await configureTray(); }
    catch(error) { trayAvailable=false; message(`${t("noTray")} ${String(error)}`); }
    $("autostart").checked=await invoke("linux_autostart_enabled");
    const startup=await invoke("linux_startup");
    if(startup.autostart && startup.start_hidden && trayAvailable) await invoke("hide_window_to_tray");
  } catch(error) { message(String(error)); }
  try { await refreshDevices({quiet:true}); if(!devices.inputs.length) message(t("noInput")); } catch(error) { message(String(error)); }
  await poll(); setInterval(poll,3000);
}
initialize().catch(error => message(String(error)));
