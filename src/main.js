import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { enable as enableAutostart, disable as disableAutostart, isEnabled as isAutostartEnabled } from "@tauri-apps/plugin-autostart";
import "./style.css";

const $ = (id) => document.getElementById(id);
let connected = false;
let disconnecting = false;
let updateState = { status: "checking", update: null };
const peerCache = new Map();
const MANUAL_KEY = "duovoice.manualIps";
const VOLUME_KEY = "duovoice.volume";
const BOOST_KEY = "duovoice.boostVolume";
const MUTE_KEY = "duovoice.muted";
const COLOR_KEY = "duovoice.color";
const NOISE_ENABLED_KEY = "duovoice.noiseEnabled";
const NOISE_INTENSITY_KEY = "duovoice.noiseIntensity";
const FAVORITES_KEY = "duovoice.favorites";
const APP_VERSION = "1.1.1";
let connectedPeer = "";




const PALETTE = {
  violet: "#a78bfa",
  rose: "#f472b6",
  bleu: "#60a5fa",
  vert: "#4ade80",
  jaune: "#facc15",
  orange: "#fb923c",
  cyan: "#22d3ee",
  ardoise: "#94a3b8"
};

function applyAppColor(name) {
  const color = PALETTE[name] || PALETTE.violet;
  document.documentElement.style.setProperty("--accent", color);
  document.documentElement.style.setProperty("--accent-soft", `${color}22`);
  document.documentElement.style.setProperty("--accent-focus", `${color}2e`);
  localStorage.setItem(COLOR_KEY, name);
  document.querySelectorAll(".color-choice").forEach(b => b.classList.toggle("active", b.dataset.color === name));
}

function initColors() {
  const box = $("colorChoices");
  if (!box) return;
  for (const [name, color] of Object.entries(PALETTE)) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "color-choice"; b.dataset.color = name;
    b.title = name; b.style.setProperty("--swatch", color);
    b.addEventListener("click", () => applyAppColor(name));
    box.appendChild(b);
  }
  applyAppColor(localStorage.getItem(COLOR_KEY) || "violet");
}

function setDetails(text) { $("details").textContent = text; }

function showSettings() {
  $("mainView").classList.add("hidden");
  $("settingsView").classList.remove("hidden");
}

function showMain() {
  $("settingsView").classList.add("hidden");
  $("mainView").classList.remove("hidden");
}

function loadFavorites() {
  try {
    const raw = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter(f => f && f.address) : [];
  } catch { return []; }
}

function saveFavorites(favorites) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
}

function favoriteFor(address) {
  return loadFavorites().find(f => f.address === address);
}

function updateFavoriteButton() {
  const button = $("favoriteBtn");
  if (!button) return;
  const favorite = favoriteFor($("peer").value);
  button.textContent = favorite ? "★" : "☆";
  button.classList.toggle("active", !!favorite);
  button.title = favorite ? "Retirer des favoris" : "Ajouter aux favoris";
  button.setAttribute("aria-label", button.title);
  button.disabled = !$("peer").value;
}

function renderFavorites() {
  const box = $("favoritesList");
  if (!box) return;
  const favorites = loadFavorites().sort((a, b) => a.name.localeCompare(b.name));
  box.innerHTML = "";
  if (!favorites.length) {
    box.innerHTML = '<div class="favorites-empty">Aucun favori. Sélectionnez un PC puis cliquez sur ☆.</div>';
    return;
  }

  for (const favorite of favorites) {
    const peer = peerCache.get(favorite.address);
    const available = !!peer;
    const isActive = connected && connectedPeer === favorite.address;
    const item = document.createElement("div");
    item.className = `favorite-item${available ? " available" : " unavailable"}${isActive ? " active" : ""}`;

    const connectBtn = document.createElement("button");
    connectBtn.type = "button";
    connectBtn.className = "favorite-action favorite-connect";
    connectBtn.textContent = "↗";
    connectBtn.title = isActive ? "Déjà connecté" : "Se connecter";
    connectBtn.disabled = !available || isActive;
    connectBtn.addEventListener("click", () => connectToAddress(favorite.address));

    const disconnectBtn = document.createElement("button");
    disconnectBtn.type = "button";
    disconnectBtn.className = "favorite-action favorite-disconnect";
    disconnectBtn.textContent = "×";
    disconnectBtn.title = "Se déconnecter";
    disconnectBtn.disabled = !isActive;
    disconnectBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      disconnectFromFavorite(favorite.address);
    });

    item.innerHTML = `
      <span class="favorite-dot"></span>
      <span class="favorite-info"><strong>${escapeHtml(favorite.name)}</strong><small>${escapeHtml(favorite.address)}</small></span>
      <span class="favorite-status">${isActive ? "Connecté" : (available ? "Disponible" : "Indisponible")}</span>
    `;
    const actions = document.createElement("span");
    actions.className = "favorite-actions";
    actions.append(connectBtn, disconnectBtn);
    item.appendChild(actions);
    box.appendChild(item);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;"}[c]));
}

function renderPeers(preferred = "") {
  const select = $("peer");
  const current = preferred || select.value;
  select.innerHTML = "";
  const list = [...peerCache.values()].sort((a,b) => a.name.localeCompare(b.name));
  if (!list.length) select.add(new Option("Aucun PC détecté — ajoutez une IP", ""));
  for (const p of list) select.add(new Option(`${p.name} — ${p.address}`, p.address));
  if (current && [...select.options].some(o => o.value === current)) select.value = current;
  updateFavoriteButton();
  renderFavorites();
}

function toggleFavorite() {
  const address = $("peer").value;
  if (!address) return;
  const favorites = loadFavorites();
  const index = favorites.findIndex(f => f.address === address);
  if (index >= 0) {
    favorites.splice(index, 1);
    saveFavorites(favorites);
    setDetails("Favori retiré.");
  } else {
    const peer = peerCache.get(address);
    const name = peer?.name || `PC — ${address}`;
    favorites.push({ name, address });
    saveFavorites(favorites);
    setDetails(`${name} ajouté aux favoris.`);
  }
  updateFavoriteButton();
  renderFavorites();
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
  $("volume").max = $("boostVolume").checked ? 200 : 100;
  const value = Number($("volume").value);
  $("volumeValue").textContent = `${value}%`;
  $("savedVolume").textContent = `${value}%`;
}

function loadNoisePreferences() {
  const enabled = localStorage.getItem(NOISE_ENABLED_KEY) === "true";
  const intensity = Math.max(0, Math.min(100, Number(localStorage.getItem(NOISE_INTENSITY_KEY) ?? 65)));
  $("noiseEnabled").checked = enabled;
  $("noiseIntensity").value = intensity;
  updateNoiseUi();
  applyNoiseSettings();
}

function updateNoiseUi() {
  const enabled = $("noiseEnabled").checked;
  const intensity = Number($("noiseIntensity").value);
  $("noiseIntensityValue").textContent = `${intensity}%`;
  $("noiseStatus").textContent = enabled ? `Activée · ${intensity}%` : "Désactivée";
  $("savedNoise").textContent = enabled ? `Activée · ${intensity}%` : "Désactivée";
  $("noiseSettings").classList.toggle("active", enabled);
}

async function applyNoiseSettings() {
  const enabled = $("noiseEnabled").checked;
  const intensity = Number($("noiseIntensity").value) / 100;
  localStorage.setItem(NOISE_ENABLED_KEY, String(enabled));
  localStorage.setItem(NOISE_INTENSITY_KEY, String(Math.round(intensity * 100)));
  updateNoiseUi();
  try {
    await invoke("set_noise_reduction", { enabled, intensity });
  } catch (e) {
    setDetails(`Réduction de bruit : ${e}`);
  }
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

async function updateLatency() {
  const el = $("latency");
  if (!connected) { el.textContent = "— ms"; return; }
  try {
    const ms = await invoke("measure_latency");
    const rounded = Math.max(0, Math.round(Number(ms)));
    el.textContent = `${rounded} ms`;
  } catch {
    el.textContent = "…";
  }
}

async function connectToAddress(address) {
  if (!address || disconnecting) return;
  const button = $("connect");
  button.disabled = true;
  try {
    if (connected && connectedPeer === address) return;
    if (connected) await disconnect();
    setDetails(`Connexion à ${address}…`);
    await invoke("start_audio", { remote: address, input: $("input").value || null, output: $("output").value || null });
    await applyVolume();
    connected = true;
    connectedPeer = address;
    $("peer").value = address;
    button.textContent = "Se déconnecter";
    $("status").innerHTML = '<span class="status-dot"></span>Connecté';
    $("status").className = "status online";
    setDetails("Audio bidirectionnel actif.");
    renderFavorites();
    await updateLatency();
  } catch (e) {
    connected = false;
    connectedPeer = "";
    button.textContent = "Se connecter";
    $("status").innerHTML = '<span class="status-dot"></span>Hors ligne';
    $("status").className = "status offline";
    setDetails(`Connexion impossible : ${e}`);
    renderFavorites();
  } finally {
    button.disabled = false;
  }
}

async function disconnect() {
  if (disconnecting) return;
  disconnecting = true;
  const oldPeer = connectedPeer;
  connected = false;
  connectedPeer = "";
  $("connect").textContent = "Se connecter";
  $("status").innerHTML = '<span class="status-dot"></span>Hors ligne';
  $("status").className = "status offline";
  $("latency").textContent = "— ms";
  renderFavorites();
  try {
    await invoke("stop_audio");
    setDetails(oldPeer ? "Déconnecté." : "Audio arrêté.");
  } catch (e) {
    setDetails(`Déconnexion : ${e}`);
  } finally {
    disconnecting = false;
    renderFavorites();
  }
}

async function disconnectFromFavorite(address) {
  if (!connected || connectedPeer !== address) return;
  await disconnect();
}

async function connect() {
  const peer = $("peer").value;
  if (!peer) { setDetails("Sélectionnez un ordinateur ou ajoutez une IP."); return; }
  if (connected) {
    const button = $("connect");
    button.disabled = true;
    try { await disconnect(); }
    catch (_) {}
    finally { button.disabled = false; }
    return;
  }
  await connectToAddress(peer);
}


async function setUpdateBanner(status, update = null, error = "") {
  updateState = { status, update };
  const banner = $("updateBanner");
  if (!banner) return;
  banner.className = `update-banner ${status}`;
  banner.disabled = status === "checking";
  banner.onclick = null;
  banner.title = "";
  if (status === "checking") {
    banner.textContent = "↻ Vérification des mises à jour…";
  } else if (status === "current") {
    banner.textContent = `✓ DuoVoice est à jour · v${APP_VERSION} · cliquer pour rechercher`;
    banner.onclick = checkForUpdates;
  } else if (status === "available") {
    banner.textContent = `↑ Mise à jour disponible · v${update.version} — cliquer pour installer`;
    banner.onclick = installUpdate;
  } else {
    banner.textContent = `⚠ Vérification impossible · v${APP_VERSION} · cliquer pour réessayer`;
    banner.onclick = checkForUpdates;
    banner.title = error || "Vérification impossible";
  }
}

async function checkForUpdates() {
  if (updateChecking) return;
  updateChecking = true;
  await setUpdateBanner("checking");
  try {
    const update = await check();
    if (update) {
      await setUpdateBanner("available", update);
    } else {
      await setUpdateBanner("current");
    }
  } catch (e) {
    await setUpdateBanner("error", null, String(e));
  } finally {
    updateChecking = false;
  }
}

async function installUpdate() {
  const update = updateState.update;
  if (!update || updateState.status !== "available") return;
  const banner = $("updateBanner");
  if (!banner) return;

  banner.disabled = true;
  banner.textContent = `Téléchargement de v${update.version}…`;
  setDetails(`Téléchargement de la mise à jour v${update.version}…`);

  try {
    let downloaded = 0;
    let total = 0;

    await update.downloadAndInstall((event) => {
      if (event.event === "Started") {
        total = Number(event.data.contentLength || 0);
        downloaded = 0;
        banner.textContent = total > 0
          ? `Téléchargement de v${update.version} · 0%`
          : `Téléchargement de v${update.version}…`;
        setDetails("Téléchargement de la mise à jour…");
      } else if (event.event === "Progress") {
        downloaded += Number(event.data.chunkLength || 0);
        if (total > 0) {
          const percent = Math.min(100, Math.round((downloaded / total) * 100));
          banner.textContent = `Téléchargement de v${update.version} · ${percent}%`;
          setDetails(`Téléchargement de la mise à jour… ${percent}%`);
        }
      } else if (event.event === "Finished") {
        banner.textContent = "Installation terminée. Redémarrage…";
        setDetails("Installation terminée. Redémarrage de DuoVoice…");
      }
    });

    // Tauri's updater normally terminates/restarts the application on Windows.
    // On platforms where it returns, explicitly relaunch the updated binary.
    try {
      await relaunch();
    } catch (relaunchError) {
      setDetails(`Mise à jour installée, mais redémarrage automatique impossible : ${relaunchError}`);
      window.location.reload();
    }
  } catch (e) {
    banner.disabled = false;
    await setUpdateBanner("available", update);
    setDetails(`Mise à jour impossible : ${e}`);
  }
}

$("connect").addEventListener("click", connect);
$("refresh").addEventListener("click", () => loadPeers(true));
$("favoriteBtn").addEventListener("click", toggleFavorite);
$("peer").addEventListener("change", updateFavoriteButton);
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

$("noiseEnabled").addEventListener("change", applyNoiseSettings);
$("noiseIntensity").addEventListener("input", () => {
  updateNoiseUi();
  applyNoiseSettings();
});

$("noiseSettings").addEventListener("click", (event) => {
  event.stopPropagation();
  $("noisePopover").classList.toggle("hidden");
});

document.querySelectorAll("[data-noise-preset]").forEach(button => {
  button.addEventListener("click", () => {
    $("noiseIntensity").value = Math.round(Number(button.dataset.noisePreset) * 100);
    $("noiseEnabled").checked = true;
    applyNoiseSettings();
  });
});

document.addEventListener("click", event => {
  const popover = $("noisePopover");
  if (!popover.classList.contains("hidden") && !event.target.closest(".noise-control")) popover.classList.add("hidden");
});

$("input").addEventListener("change", () => localStorage.setItem("duovoice.input", $("input").value));
$("output").addEventListener("change", () => localStorage.setItem("duovoice.output", $("output").value));

$("settingsBtn").addEventListener("click", showSettings);
$("backBtn").addEventListener("click", showMain);
$("checkUpdateBtn").addEventListener("click", checkForUpdates);
$("appVersion").textContent = `v${APP_VERSION}`;

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
renderFavorites();
loadDevices();
loadAutostart();
loadAudioPreferences();
loadNoisePreferences();
initColors();
loadPeers();
setInterval(() => loadPeers(false), 3000);
setInterval(updateLatency, 1000);
updateLatency();
checkForUpdates();
