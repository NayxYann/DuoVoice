import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { listen, emitTo } from "@tauri-apps/api/event";
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
const SCALE_KEY = "duovoice.uiScale";
const LAST_UPDATE_KEY = "duovoice.lastUpdate";
const APP_VERSION = "1.1.7";
const BASE_WINDOW_WIDTH = 1080;
const BASE_WINDOW_HEIGHT = 800;
const SCALE_VALUES = [0.8, 0.9, 1, 1.1, 1.2, 1.3];
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
  emitTo("tray", "theme-changed", { color: name }).catch(() => {});
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

function updateHeaderMode() {
  const settings = !$(`settingsView`).classList.contains("hidden");
  const button = $("settingsBtn");
  button.textContent = settings ? "←" : "⚙";
  button.title = settings ? "Retour" : "Paramètres";
  button.setAttribute("aria-label", button.title);
  button.classList.toggle("settings-back", settings);
}

function showSettings() {
  $("mainView").classList.add("hidden");
  $("settingsView").classList.remove("hidden");
  updateHeaderMode();
}

function showMain() {
  $("settingsView").classList.add("hidden");
  $("mainView").classList.remove("hidden");
  updateHeaderMode();
}

function setUiScaleControl(value) {
  const scale = Number(value) || 1;
  $("uiScale").value = String(scale);
  $("uiScaleValue").textContent = `${Math.round(scale * 100)}%`;
}

async function applyUiScale(value) {
  const numeric = Number(value) || 1;
  const scale = SCALE_VALUES.reduce((best, candidate) => Math.abs(candidate - numeric) < Math.abs(best - numeric) ? candidate : best, 1);
  const scroll = $("settingsScroll");
  const scaleCard = $("scaleActions")?.closest(".card");
  const anchorTop = scroll && scaleCard ? scaleCard.getBoundingClientRect().top : null;
  const previousScale = Number(getComputedStyle(document.documentElement).getPropertyValue("--ui-scale")) || 1;

  document.documentElement.style.setProperty("--ui-scale", String(scale));
  setUiScaleControl(scale);
  localStorage.setItem(SCALE_KEY, String(scale));

  try {
    const window = getCurrentWindow();
    await window.setSize(new LogicalSize(Math.round(BASE_WINDOW_WIDTH * scale), Math.round(BASE_WINDOW_HEIGHT * scale)));

    // Keep the scale card at the exact same screen position. The page is zoomed
    // around its top-left corner, so the scroll offset has to be compensated
    // proportionally instead of scrolling the buttons into view afterwards.
    if (scroll && scaleCard && anchorTop !== null) {
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const newTop = scaleCard.getBoundingClientRect().top;
      const zoom = scale / previousScale;
      const delta = newTop - anchorTop;
      if (Math.abs(delta) > 0.5 && zoom > 0) {
        scroll.scrollTop += delta / zoom;
      }
      await new Promise(requestAnimationFrame);
      const correctedTop = scaleCard.getBoundingClientRect().top;
      const remaining = correctedTop - anchorTop;
      if (Math.abs(remaining) > 0.5) {
        scroll.scrollTop += remaining / zoom;
      }
    }
  } catch (e) {
    setDetails(`Impossible d’adapter la fenêtre à l’échelle ${Math.round(scale * 100)}% : ${e}`);
  }
}

function loadUiScale() {
  const saved = Number(localStorage.getItem(SCALE_KEY) || "1");
  const scale = SCALE_VALUES.reduce((best, candidate) => Math.abs(candidate - saved) < Math.abs(best - saved) ? candidate : best, 1);
  document.documentElement.style.setProperty("--ui-scale", String(scale));
  setUiScaleControl(scale);
}

async function resetUiScale() {
  setUiScaleControl(1);
  await applyUiScale(1);
  setDetails("Échelle de l’interface rétablie à 100%.");
}

async function requestQuit() {
  const confirmed = window.confirm("Êtes-vous sûr de vouloir quitter DuoVoice ?");
  if (!confirmed) return;
  try { await invoke("quit_app"); }
  catch (e) { setDetails(`Impossible de quitter DuoVoice : ${e}`); }
}

function setLastUpdateNow() {
  localStorage.setItem(LAST_UPDATE_KEY, new Date().toISOString());
}

function recordInstalledVersion() {
  const previous = localStorage.getItem("duovoice.installedVersion");
  if (previous !== APP_VERSION) {
    localStorage.setItem("duovoice.installedVersion", APP_VERSION);
    setLastUpdateNow();
  }
}

function formatLastUpdate() {
  const value = localStorage.getItem(LAST_UPDATE_KEY);
  if (!value) return "Date de mise à jour : non disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date de mise à jour : non disponible";
  return `Dernière mise à jour : ${date.toLocaleDateString("fr-FR")} à ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
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


let updateChecking = false;
let updateCheckToken = 0;

async function setUpdateBanner(status, update = null, error = "") {
  updateState = { status, update };
  const banner = $("updateBanner");
  if (!banner) return;
  banner.className = `update-banner ${status}`;
  banner.disabled = false;
  banner.onclick = null;
  banner.title = "";

  if (status === "checking") {
    banner.textContent = "↻ Recherche des mises à jour…";
    banner.disabled = true;
  } else if (status === "current") {
    banner.textContent = "✓ Pas de mise à jour disponible · Cliquez pour vérifier";
    banner.onclick = checkForUpdates;
    banner.title = "Cliquer pour lancer une nouvelle vérification.";
  } else if (status === "available") {
    banner.textContent = `↑ Mise à jour disponible · v${update.version} · Cliquez pour télécharger`;
    banner.onclick = installUpdate;
    banner.title = `Télécharger et installer DuoVoice v${update.version}`;
  } else {
    banner.textContent = "⚠ Vérification impossible · Cliquez pour réessayer";
    banner.onclick = checkForUpdates;
    banner.title = error || "Vérification impossible";
  }
}

async function checkForUpdates() {
  if (updateChecking) return;
  updateChecking = true;
  const token = ++updateCheckToken;
  await setUpdateBanner("checking");
  setDetails("Recherche des mises à jour…");

  try {
    const update = await Promise.race([
      check(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Délai de vérification dépassé (10 s).")), 10000))
    ]);
    if (token !== updateCheckToken) return;
    localStorage.setItem("duovoice.lastUpdateCheck", new Date().toISOString());

    if (update) {
      await setUpdateBanner("available", update);
      setDetails(`Mise à jour v${update.version} disponible.`);
    } else {
      await setUpdateBanner("current");
      setDetails(`Vérification terminée à ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} : aucune mise à jour disponible.`);
    }
  } catch (e) {
    if (token !== updateCheckToken) return;
    await setUpdateBanner("error", null, String(e));
    setDetails(`Vérification des mises à jour impossible : ${String(e)}`);
  } finally {
    if (token === updateCheckToken) updateChecking = false;
  }
}

async function installUpdate() {
  const update = updateState.update;
  if (!update || updateState.status !== "available") return;
  const banner = $("updateBanner");
  if (!banner) return;

  banner.disabled = true;
  banner.textContent = `Préparation de v${update.version}…`;
  setDetails(`Préparation du téléchargement de v${update.version}…`);

  try {
    let downloaded = 0;
    let total = 0;

    // Separate download and install so an error can be identified precisely.
    await update.download((event) => {
      if (event.event === "Started") {
        total = Number(event.data.contentLength || 0);
        downloaded = 0;
        banner.textContent = total > 0 ? `Téléchargement de v${update.version} · 0%` : `Téléchargement de v${update.version}…`;
        setDetails(total > 0 ? `Téléchargement de la mise à jour… 0%` : "Téléchargement de la mise à jour…");
      } else if (event.event === "Progress") {
        downloaded += Number(event.data.chunkLength || 0);
        if (total > 0) {
          const percent = Math.min(100, Math.round((downloaded / total) * 100));
          banner.textContent = `Téléchargement de v${update.version} · ${percent}%`;
          setDetails(`Téléchargement de la mise à jour… ${percent}%`);
        }
      } else if (event.event === "Finished") {
        banner.textContent = `Installation de v${update.version}…`;
        setDetails("Téléchargement terminé. Vérification de la mise à jour…");
      }
    }, { timeout: 120000 });

    banner.textContent = `Installation de v${update.version}…`;
    setDetails("Téléchargement terminé. Installation de la mise à jour…");
    await update.install();

    // Windows exits automatically when the updater installer is launched.
    // Linux needs an explicit restart after the installation finishes.
    const isWindows = navigator.userAgent.toLowerCase().includes("windows");
    if (!isWindows) {
      setLastUpdateNow();
      $("lastUpdate").textContent = formatLastUpdate();
      setDetails("Mise à jour installée. Redémarrage de DuoVoice…");
      await relaunch();
    }
  } catch (e) {
    const message = String(e);
    banner.disabled = false;
    await setUpdateBanner("available", update);
    setDetails(`Mise à jour impossible : ${message}`);
    console.error("DuoVoice updater error:", e, update.rawJson || update);
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

$("settingsBtn").addEventListener("click", () => {
  if ($("settingsView").classList.contains("hidden")) showSettings(); else showMain();
});
$("quitBtn").addEventListener("click", requestQuit);
recordInstalledVersion();
$("appVersion").textContent = `v${APP_VERSION}`;
$("lastUpdate").textContent = formatLastUpdate();
$("uiScale").addEventListener("input", () => setUiScaleControl($("uiScale").value));
$("applyUiScale").addEventListener("click", async () => { await applyUiScale($("uiScale").value); setDetails(`Échelle de l’interface appliquée : ${$("uiScaleValue").textContent}.`); });
$("resetUiScale").addEventListener("click", resetUiScale);
updateHeaderMode();
loadUiScale();
applyUiScale($("uiScale").value);

listen("focus-window", async () => {
  try {
    const window = getCurrentWindow();
    await window.setSkipTaskbar(false);
    await window.show();
    await window.unminimize();
    await window.setFocus();
  } catch (e) {
    setDetails(`Impossible de remettre DuoVoice au premier plan : ${e}`);
  }
}).catch(() => {});

$("autostart").addEventListener("change", async e => {
  try {
    if (e.target.checked) await enableAutostart(); else await disableAutostart();
    $("autostartDetails").textContent = e.target.checked ? "Démarrage automatique activé." : "Démarrage automatique désactivé.";
  } catch (err) {
    e.target.checked = await isAutostartEnabled().catch(() => false);
    $("autostartDetails").textContent = `Impossible de modifier l'autostart : ${err}`;
  }
});

$("startHidden").checked = localStorage.getItem("duovoice.startHidden") === "true";
$("closeAction").value = localStorage.getItem("duovoice.closeAction") || "tray";
if ($("startHidden").checked) {
  invoke("hide_window_to_tray").catch((e) => setDetails(`Impossible de démarrer dans le tray : ${e}`));
}

$("startHidden").addEventListener("change", () => localStorage.setItem("duovoice.startHidden", String($("startHidden").checked)));
$("closeAction").addEventListener("change", async () => {
  const value = $("closeAction").value;
  localStorage.setItem("duovoice.closeAction", value);
  try { await invoke("set_close_action", { action: value }); }
  catch (e) { setDetails(`Réglage fermeture : ${e}`); }
});

listen("open-settings", showSettings).catch(() => {});

async function refreshFromTray() {
  try {
    const state = await invoke("audio_status");
    connected = Boolean(state.connected);
    connectedPeer = state.remote || "";
    $("connect").textContent = connected ? "Se déconnecter" : "Se connecter";
    $("status").innerHTML = `<span class="status-dot"></span>${connected ? "Connecté" : "Hors ligne"}`;
    $("status").className = `status ${connected ? "online" : "offline"}`;
    $("peer").value = connectedPeer;
    await loadPeers(false);
    await updateLatency();
    renderFavorites();
  } catch {}
}

listen("tray-open-main", async () => {
  try {
    const w = getCurrentWindow();
    await w.setSkipTaskbar(false);
    await w.show();
    await w.unminimize();
    await w.setFocus();
  } catch {}
});
listen("tray-open-settings", async () => {
  try {
    const w = getCurrentWindow();
    await w.setSkipTaskbar(false);
    await w.show();
    await w.unminimize();
    await w.setFocus();
    showSettings();
  } catch {}
});
listen("audio-state-changed", refreshFromTray).catch(() => {});

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
