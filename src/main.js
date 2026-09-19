import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { getVersion } from "@tauri-apps/api/app";
import { listen, emitTo } from "@tauri-apps/api/event";
import { check } from "@tauri-apps/plugin-updater";
import { enable as enableAutostart, disable as disableAutostart, isEnabled as isAutostartEnabled } from "@tauri-apps/plugin-autostart";
import "./style.css";
import { COLOR_KEY, THEME_KEY, PALETTE, THEMES, applyThemeVariables, normalizeThemeName } from "./theme.js";
import { LANGUAGE_KEY, getLanguage, setLanguage, t, localeForLanguage, applyStaticTranslations } from "./i18n.js";

const $ = (id) => document.getElementById(id);
let connected = false;
let disconnecting = false;
let updateState = { status: "checking", update: null };
const peerCache = new Map();
const MANUAL_KEY = "duovoice.manualIps";
const VOLUME_KEY = "duovoice.volume";
const BOOST_KEY = "duovoice.boostVolume";
const MUTE_KEY = "duovoice.muted";
const NOISE_ENABLED_KEY = "duovoice.noiseEnabled";
const NOISE_INTENSITY_KEY = "duovoice.noiseIntensity";
const FAVORITES_KEY = "duovoice.favorites";
const RECENTS_KEY = "duovoice.recentConnections";
const SESSION_KEY = "duovoice.sessionPeers";
const COMMUNICATION_MODE_KEY = "duovoice.communicationMode";
const MAX_SESSION_PARTICIPANTS = 12;
const MAX_SESSION_REMOTES = MAX_SESSION_PARTICIPANTS - 1;
const SCALE_KEY = "duovoice.uiScale";
const TRAY_SCALE_KEY = "duovoice.trayScale";
const TRAY_ICON_KEY = "duovoice.trayIconEnabled";
const CLIENT_NAME_KEY = "duovoice.clientName";
const LAST_UPDATE_KEY = "duovoice.lastUpdate";
const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_TRAY_ICON_ENABLED = true;
const DEFAULT_CLOSE_ACTION = "tray";
const FALLBACK_VERSION = "1.4.0";
let appVersion = FALLBACK_VERSION;
const BASE_WINDOW_WIDTH = 1080;
const BASE_WINDOW_HEIGHT = 760;
const GROUP_WINDOW_HEIGHT = 800;
const GROUP_WINDOW_MAX_HEIGHT = 900;
const SCALE_VALUES = [0.8, 0.9, 1, 1.1, 1.2, 1.3];
const TRAY_SCALE_VALUES = [0.9, 1, 1.1, 1.2];
let connectedPeer = "";
let connectedPeers = [];
let sessionPeers = new Set();
let deviceDefaults = { input: null, output: null };
let appliedClientName = "";
let appliedUiScale = 1;
let appliedTrayScale = 1;
let appliedInputDevice = null;
let appliedOutputDevice = null;
let switchingAudioDevice = false;
let communicationMode = localStorage.getItem(COMMUNICATION_MODE_KEY) === "group" ? "group" : "duo";
let activeRoom = null;
let roomsCache = [];
let roomSyncBusy = false;
let micMonitorActive = false;
let micMonitorTimer = null;
let currentDesignHeight = BASE_WINDOW_HEIGHT;



// Canonical SVG set used by dynamic controls. Keeping the markup here prevents
// dynamic state changes from falling back to unrelated Unicode/CSS icons.
const iconSvg = (content) => `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true">${content}</svg>`;
const UI_ICONS = {
  check: iconSvg('<path d="m20 6-11 11-5-5"/>'),
  star: iconSvg('<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z"/>'),
  link: iconSvg('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'),
  x: iconSvg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  refresh: iconSvg('<path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M16 8h5V3"/>'),
  download: iconSvg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>'),
  alert: iconSvg('<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
};
const NAV_ICONS = {
  back: iconSvg('<path d="m15 18-6-6 6-6"/>'),
  settings: iconSvg('<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.09a2 2 0 0 1 1 1.74v.5a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z"/><circle cx="12" cy="12" r="3"/>'),
};
const iconLabel = (icon, label) => `${icon}<span>${label}</span>`;

function syncThemeControls(themeName, colorName) {
  document.querySelectorAll(".color-choice").forEach((button) => {
    button.classList.toggle("active", themeName === "duovoice" && button.dataset.color === colorName);
  });
  document.querySelectorAll(".theme-choice").forEach((button) => {
    button.classList.toggle("active", button.dataset.theme === themeName);
  });
}

function broadcastTheme(themeName, colorName) {
  const payload = { theme: themeName, color: colorName };
  emitTo("tray", "theme-changed", payload).catch(() => {});
  emitTo("tray-menu", "theme-changed", payload).catch(() => {});
}

function syncNativeTrayTheme(themeName, colorName) {
  invoke("set_tray_theme_icon", { theme: normalizeThemeName(themeName), color: colorName || "violet" })
    .catch(error => reportError("Tray theme icon", error));
}

function applyVisualTheme(themeName, { persist = true, broadcast = true } = {}) {
  const colorName = localStorage.getItem(COLOR_KEY) || "violet";
  const normalized = applyThemeVariables(document.documentElement, themeName, colorName);
  if (persist) localStorage.setItem(THEME_KEY, normalized);
  syncThemeControls(normalized, colorName);
  syncNativeTrayTheme(normalized, colorName);
  if (broadcast) broadcastTheme(normalized, colorName);
  return normalized;
}

function applyAppColor(name) {
  const colorName = Object.prototype.hasOwnProperty.call(PALETTE, name) ? name : "violet";
  localStorage.setItem(COLOR_KEY, colorName);
  localStorage.setItem(THEME_KEY, "duovoice");
  applyThemeVariables(document.documentElement, "duovoice", colorName);
  syncThemeControls("duovoice", colorName);
  syncNativeTrayTheme("duovoice", colorName);
  broadcastTheme("duovoice", colorName);
}

function initColors() {
  const box = $("colorChoices");
  if (box) {
    for (const [name, color] of Object.entries(PALETTE)) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "color-choice"; b.dataset.color = name;
      b.title = name; b.style.setProperty("--swatch", color);
      b.addEventListener("click", () => applyAppColor(name));
      box.appendChild(b);
    }
  }

  const themeBox = $("themeChoices");
  if (themeBox) {
    for (const [name, theme] of Object.entries(THEMES)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "theme-choice";
      button.dataset.theme = name;
      button.title = theme.description;
      const swatches = theme.preview.map((value) => `<i style="--theme-swatch:${value}"></i>`).join("");
      button.innerHTML = `<span class="theme-preview">${swatches}</span><span class="theme-choice-copy"><strong>${theme.label}</strong><small>${theme.description}</small></span>`;
      button.addEventListener("click", () => applyVisualTheme(name));
      themeBox.appendChild(button);
    }
  }

  const savedTheme = normalizeThemeName(localStorage.getItem(THEME_KEY) || "duovoice");
  applyVisualTheme(savedTheme, { persist: false, broadcast: true });
}

function setDetails(text) { $("details").textContent = text; }

function updateClientNameVisual(applied = false) {
  const input = $("clientName");
  const button = $("saveClientName");
  if (!input || !button) return;
  const isCurrent = input.value.trim() === appliedClientName;

  // One icon, two unmistakable states: green = a change can be applied,
  // grey = the displayed name is already active and there is nothing to do.
  button.innerHTML = UI_ICONS.check;
  button.classList.toggle("is-applied", isCurrent);
  button.classList.toggle("is-dirty", !isCurrent);
  button.disabled = isCurrent;
  button.title = isCurrent ? "Nom déjà appliqué" : "Valider ce nouveau nom";
  button.setAttribute("aria-label", button.title);

  if (applied && isCurrent) {
    button.classList.remove("validation-pop");
    void button.offsetWidth;
    button.classList.add("validation-pop");
  }
}

async function loadClientName() {
  try {
    const systemName = await invoke("get_client_name");
    const saved = (localStorage.getItem(CLIENT_NAME_KEY) || "").trim();
    const desired = saved || systemName || "DuoVoice";
    const applied = await invoke("set_client_name", { name: desired });
    appliedClientName = applied;
    $("clientName").value = applied;
    localStorage.setItem(CLIENT_NAME_KEY, applied);
    updateClientNameVisual();
  } catch (e) {
    reportError("Client name", e);
  }
}

async function saveClientName() {
  const input = $("clientName");
  const button = $("saveClientName");
  if (button.disabled) return;
  try {
    button.disabled = true;
    const applied = await invoke("set_client_name", { name: input.value });
    appliedClientName = applied;
    input.value = applied;
    localStorage.setItem(CLIENT_NAME_KEY, applied);
    updateClientNameVisual(true);
    setDetails(`✓ Nom réseau appliqué : ${applied}. Les autres PC le verront automatiquement.`);
  } catch (e) {
    setDetails(`Nom de la machine : ${e}`);
    input.focus();
    updateClientNameVisual();
  }
}

function applyLanguageUi(language = getLanguage(), { broadcast = false } = {}) {
  const lang = setLanguage(language);
  applyStaticTranslations(document, lang);
  const select = $("languageSelect");
  if (select) select.value = lang;
  updateHeaderMode();
  updateNoiseUi();
  updateMuteUi(localStorage.getItem(MUTE_KEY) === "true");
  renderPeers();
  renderFavorites();
  renderSessionMembers();
  renderRecentConnections();
  if (updateState.status) setUpdateBanner(updateState.status, updateState.update);
  if ($("lastUpdate")) $("lastUpdate").textContent = formatLastUpdate();
  if (broadcast) {
    emitTo("tray", "language-changed", { language: lang }).catch(() => {});
    emitTo("tray-menu", "language-changed", { language: lang }).catch(() => {});
  }
  return lang;
}

function reportError(scope, error) {
  invoke("log_client_error", { message: `${scope}: ${String(error)}` }).catch(() => {});
}

function updateHeaderMode() {
  const settings = !$(`settingsView`).classList.contains("hidden");
  const button = $("settingsBtn");
  button.innerHTML = settings ? NAV_ICONS.back : NAV_ICONS.settings;
  button.title = settings ? (getLanguage() === "fr" ? "Retour" : getLanguage() === "es" ? "Volver" : getLanguage() === "de" ? "Zurück" : "Back") : t("common.settings");
  button.setAttribute("aria-label", button.title);
  button.classList.toggle("settings-back", settings);
}

function showSettings() {
  $("mainView").classList.add("hidden");
  $("settingsView").classList.remove("hidden");
  updateHeaderMode();
  resizeDesignWindow(BASE_WINDOW_HEIGHT).catch(() => {});
}

function showMain() {
  $("settingsView").classList.add("hidden");
  $("mainView").classList.remove("hidden");
  updateHeaderMode();
  resizeDesignWindow(preferredMainWindowHeight()).catch(() => {});
}

function setUiScaleControl(value) {
  const scale = Number(value) || 1;
  $("uiScale").value = String(scale);
  $("uiScaleValue").textContent = `${Math.round(scale * 100)}%`;
}

function setTrayScaleControl(value) {
  const scale = Number(value) || 1;
  $("trayScale").value = String(scale);
  $("trayScaleValue").textContent = `${Math.round(scale * 100)}%`;
}

function normalizedScale(value) {
  const numeric = Number(value) || 1;
  return SCALE_VALUES.reduce((best, candidate) =>
    Math.abs(candidate - numeric) < Math.abs(best - numeric) ? candidate : best, 1);
}

function normalizedTrayScale(value) {
  const numeric = Number(value) || 1;
  return TRAY_SCALE_VALUES.reduce((best, candidate) =>
    Math.abs(candidate - numeric) < Math.abs(best - numeric) ? candidate : best, 1);
}

async function applyTrayScale(value) {
  const scale = normalizedTrayScale(value);
  setTrayScaleControl(scale);
  try {
    await invoke("set_tray_scale", { scale });
    await emitTo("tray", "tray-scale-changed", { scale });
    await emitTo("tray-menu", "tray-scale-changed", { scale });
    localStorage.setItem(TRAY_SCALE_KEY, String(scale));
    appliedTrayScale = scale;
    return true;
  } catch (e) {
    reportError("Tray scale", e);
    setDetails(`Impossible d’adapter le contrôle rapide à ${Math.round(scale * 100)}% : ${e}`);
    return false;
  }
}

function preferredMainWindowHeight() {
  if (communicationMode !== "group") return BASE_WINDOW_HEIGHT;
  const visibleRooms = Math.min(3, roomsCache.filter(room => room?.id).length);
  return Math.min(
    GROUP_WINDOW_MAX_HEIGHT,
    GROUP_WINDOW_HEIGHT + visibleRooms * 28 + (activeRoom ? 44 : 0),
  );
}

async function resizeDesignWindow(height = currentDesignHeight, scale = appliedUiScale) {
  currentDesignHeight = Math.max(BASE_WINDOW_HEIGHT, Math.round(Number(height) || BASE_WINDOW_HEIGHT));

  // Grow with the current workflow, but never push controls below the usable
  // desktop. On a shorter display the central view becomes scrollable instead.
  const desiredNativeHeight = Math.round(currentDesignHeight * scale);
  const availableHeight = Number(globalThis.screen?.availHeight) || desiredNativeHeight;
  const nativeHeight = Math.min(desiredNativeHeight, Math.max(560, Math.floor(availableHeight - 20)));
  const effectiveDesignHeight = Math.max(560, Math.floor(nativeHeight / scale));
  document.documentElement.style.setProperty("--design-height", `${effectiveDesignHeight}px`);

  const appWindow = getCurrentWindow();
  await appWindow.setSize(new LogicalSize(
    Math.round(BASE_WINDOW_WIDTH * scale),
    nativeHeight,
  ));
}

async function applyUiScale(value) {
  const scale = normalizedScale(value);

  // DuoVoice keeps a stable 1080 px design width while its height can grow
  // when the group-room view needs more vertical space.
  document.documentElement.style.setProperty("--ui-scale", String(scale));
  setUiScaleControl(scale);

  try {
    await resizeDesignWindow(currentDesignHeight, scale);
    localStorage.setItem(SCALE_KEY, String(scale));
    appliedUiScale = scale;
    return true;
  } catch (e) {
    reportError("UI scale", e);
    setDetails(`Impossible d’adapter la fenêtre à l’échelle ${Math.round(scale * 100)}% : ${e}`);
    return false;
  }
}

function updateScaleActionsState(justApplied = false) {
  const ui = normalizedScale($("uiScale").value);
  const tray = normalizedTrayScale($("trayScale").value);
  const apply = $("applyUiScale");
  const reset = $("resetUiScale");
  const dirty = ui !== appliedUiScale || tray !== appliedTrayScale;
  const defaultState = ui === 1 && tray === 1 && appliedUiScale === 1 && appliedTrayScale === 1;

  apply.disabled = !dirty;
  apply.classList.toggle("is-applied", !dirty);
  apply.textContent = dirty ? "Appliquer les modifications" : "✓ Paramètres appliqués";
  if (justApplied && !dirty) {
    apply.classList.remove("validation-pop");
    void apply.offsetWidth;
    apply.classList.add("validation-pop");
  }

  reset.disabled = defaultState;
  reset.classList.toggle("is-disabled-default", defaultState);
  reset.title = defaultState ? "Les deux échelles sont déjà à 100%" : "Rétablir les deux échelles à 100%";
}

function loadUiScale() {
  const scale = normalizedScale(localStorage.getItem(SCALE_KEY) || "1");
  const trayScale = normalizedTrayScale(localStorage.getItem(TRAY_SCALE_KEY) || "1");
  appliedUiScale = scale;
  appliedTrayScale = trayScale;
  document.documentElement.style.setProperty("--ui-scale", String(scale));
  setUiScaleControl(scale);
  setTrayScaleControl(trayScale);
  updateScaleActionsState();
}

async function resetUiScale() {
  setUiScaleControl(1);
  setTrayScaleControl(1);
  const results = await Promise.all([applyUiScale(1), applyTrayScale(1)]);
  updateScaleActionsState(results.every(Boolean));
  if (results.every(Boolean)) setDetails("✓ Échelles de l’application et du systray rétablies à 100%.");
}

function setAppQuitConfirmation(open) {
  const layer = $("appQuitConfirm");
  layer.classList.toggle("open", open);
  layer.setAttribute("aria-hidden", String(!open));
  if (open) $("cancelAppQuit").focus();
}

async function confirmAppQuit() {
  try {
    await invoke("quit_app");
  } catch (e) {
    setAppQuitConfirmation(false);
    setDetails(`Impossible de quitter DuoVoice : ${e}`);
  }
}

function setLastUpdateNow() {
  localStorage.setItem(LAST_UPDATE_KEY, new Date().toISOString());
}

function recordInstalledVersion() {
  const previous = localStorage.getItem("duovoice.installedVersion");
  if (previous !== appVersion) {
    localStorage.setItem("duovoice.installedVersion", appVersion);
    setLastUpdateNow();
  }
}


async function openProjectGithub() {
  try {
    await invoke("open_project_github");
  } catch (e) {
    reportError("GitHub", e);
  }
}

function bindGithubLink(element) {
  if (!element) return;
  element.addEventListener("click", openProjectGithub);
  element.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openProjectGithub();
    }
  });
}
async function loadAppVersion() {
  try { appVersion = await getVersion(); }
  catch { appVersion = FALLBACK_VERSION; }
  recordInstalledVersion();
  $("appVersion").textContent = `v${appVersion}`;
  $("lastUpdate").textContent = formatLastUpdate();
}

function formatLastUpdate() {
  const value = localStorage.getItem(LAST_UPDATE_KEY);
  if (!value) return t("settings.lastUpdateUnavailable");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("settings.lastUpdateUnavailable");
  const locale = localeForLanguage();
  const prefix = ({ en: "Last update", fr: "Dernière mise à jour", es: "Última actualización", de: "Letztes Update" })[getLanguage()] || "Last update";
  return `${prefix}: ${date.toLocaleDateString(locale)} ${date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}`;
}

const RELEASES_API = "https://api.github.com/repos/NayxYann/DuoVoice/releases?per_page=30";
let rollbackVersion = "";
let rollbackName = "";
let rollbackBusy = false;

function parseSemver(value) {
  const match = String(value || "").trim().replace(/^v/i, "").match(/^(\d+)\.(\d+)\.(\d+)$/);
  return match ? match.slice(1).map(Number) : null;
}

function compareSemver(a, b) {
  const av = parseSemver(a), bv = parseSemver(b);
  if (!av || !bv) return 0;
  for (let i = 0; i < 3; i += 1) {
    if (av[i] !== bv[i]) return av[i] - bv[i];
  }
  return 0;
}

function setVersionPicker(open) {
  const layer = $("versionPicker");
  layer.classList.toggle("open", open);
  layer.setAttribute("aria-hidden", String(!open));
  if (!open) {
    rollbackVersion = "";
    rollbackName = "";
    $("versionRollbackConfirm").classList.add("hidden");
    $("versionPickerStatus").textContent = "";
    $("versionPickerStatus").classList.remove("error");
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadPreviousVersions() {
  const list = $("versionList");
  const status = $("versionPickerStatus");
  list.innerHTML = '<div class="version-loading">Recherche des versions disponibles…</div>';
  status.textContent = "";
  status.classList.remove("error");

  try {
    const response = await fetch(RELEASES_API, {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`GitHub a répondu ${response.status}`);
    const releases = await response.json();
    const previous = releases
      .filter(release => !release.draft && !release.prerelease)
      .map(release => ({
        version: String(release.tag_name || "").replace(/^v/i, ""),
        name: String(release.name || release.tag_name || "").trim(),
        hasUpdater: Array.isArray(release.assets) && release.assets.some(asset => asset.name === "latest.json"),
      }))
      .filter(release => release.hasUpdater && parseSemver(release.version) && compareSemver(release.version, appVersion) < 0)
      .sort((a, b) => compareSemver(b.version, a.version));

    list.innerHTML = "";
    if (!previous.length) {
      list.innerHTML = '<div class="version-empty">Aucune version précédente installable n’a été trouvée.</div>';
      return;
    }

    for (const release of previous) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "version-option";
      button.innerHTML = `<span class="version-option-main"><strong>${escapeHtml(release.name || `v${release.version}`)}</strong></span>${UI_ICONS.download}`;
      button.addEventListener("click", () => {
        rollbackVersion = release.version;
        rollbackName = release.name || `v${release.version}`;
        $("rollbackVersionLabel").textContent = rollbackName;
        $("versionRollbackConfirm").classList.remove("hidden");
        $("versionPickerStatus").textContent = "";
      });
      list.appendChild(button);
    }
  } catch (e) {
    reportError("Version history", e);
    list.innerHTML = '<div class="version-empty">Impossible de récupérer l’historique des versions.</div>';
    status.textContent = String(e);
    status.classList.add("error");
  }
}

async function openVersionPicker() {
  setVersionPicker(true);
  await loadPreviousVersions();
}

async function installPreviousVersion() {
  if (!rollbackVersion || rollbackBusy) return;
  rollbackBusy = true;
  const confirm = $("confirmRollback");
  const cancel = $("cancelRollback");
  const close = $("closeVersionPicker");
  const status = $("versionPickerStatus");
  confirm.disabled = true; cancel.disabled = true; close.disabled = true;
  status.classList.remove("error");
  status.textContent = `Téléchargement et installation de v${rollbackVersion}…`;

  try {
    const installed = await invoke("install_version", { version: rollbackVersion });
    setLastUpdateNow();
    status.textContent = `DuoVoice v${installed} installé. Redémarrage…`;
  } catch (e) {
    reportError("Version rollback", e);
    status.textContent = `Installation impossible : ${String(e)}`;
    status.classList.add("error");
    confirm.disabled = false; cancel.disabled = false; close.disabled = false;
    rollbackBusy = false;
  }
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
  button.innerHTML = UI_ICONS.star;
  button.classList.toggle("active", !!favorite);
  button.title = favorite ? "Retirer des favoris" : "Ajouter aux favoris";
  button.setAttribute("aria-label", button.title);
  button.disabled = !$("peer").value;
}

function closeCompactPopovers(except = "") {
  for (const id of ["sessionPopover", "favoritesPopover"]) {
    if (id === except) continue;
    const popover = $(id);
    if (!popover) continue;
    popover.classList.add("hidden");
  }
  $("sessionSummary")?.setAttribute("aria-expanded", String(except === "sessionPopover"));
  $("favoritesSummary")?.setAttribute("aria-expanded", String(except === "favoritesPopover"));
}

function toggleCompactPopover(id) {
  const popover = $(id);
  if (!popover) return;
  const willOpen = popover.classList.contains("hidden");
  closeCompactPopovers(willOpen ? id : "");
  if (willOpen) popover.classList.remove("hidden");
  else popover.classList.add("hidden");
  $("sessionSummary")?.setAttribute("aria-expanded", String(!$("sessionPopover")?.classList.contains("hidden")));
  $("favoritesSummary")?.setAttribute("aria-expanded", String(!$("favoritesPopover")?.classList.contains("hidden")));
}

function renderFavorites() {
  const box = $("favoritesList");
  if (!box) return;
  const favorites = loadFavorites().sort((a, b) => a.name.localeCompare(b.name));
  if ($("favoritesSummaryText")) $("favoritesSummaryText").textContent = t("connection.favoritesCount", { count: favorites.length });
  if ($("favoritesCount")) $("favoritesCount").textContent = t("connection.favoritesCount", { count: favorites.length });
  box.innerHTML = "";
  if (!favorites.length) {
    box.innerHTML = `<div class="favorites-empty">${({en:'No favorites yet. Select a PC, then use the Favorite button.',fr:'Aucun favori. Sélectionnez un PC puis utilisez le bouton Favori.',es:'Aún no hay favoritos. Selecciona un PC y usa el botón Favorito.',de:'Noch keine Favoriten. Wähle einen PC und nutze die Favoriten-Schaltfläche.'})[getLanguage()]}</div>`;
    return;
  }

  for (const favorite of favorites) {
    const peer = peerCache.get(favorite.address);
    const available = !!peer;
    const isActive = connected && connectedPeers.includes(favorite.address);
    const item = document.createElement("div");
    item.className = `favorite-item${available ? " available" : " unavailable"}${isActive ? " active" : ""}`;

    const connectBtn = document.createElement("button");
    connectBtn.type = "button";
    connectBtn.className = "favorite-action favorite-connect";
    connectBtn.innerHTML = UI_ICONS.link;
    connectBtn.title = isActive ? t("status.connected") : t("connection.connect");
    connectBtn.disabled = !available || isActive;
    connectBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (connected) {
        const merged = new Set(connectedPeers);
        merged.add(favorite.address);
        sessionPeers = new Set([...merged].slice(0, MAX_SESSION_REMOTES));
        persistSessionPeers();
        await syncLiveSessionPeers();
      } else {
        sessionPeers = new Set([favorite.address]);
        persistSessionPeers();
        await connectToAddresses([favorite.address]);
      }
    });

    const disconnectBtn = document.createElement("button");
    disconnectBtn.type = "button";
    disconnectBtn.className = "favorite-action favorite-disconnect";
    disconnectBtn.innerHTML = UI_ICONS.x;
    disconnectBtn.title = t("group.remove");
    disconnectBtn.disabled = !isActive;
    disconnectBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await removePeerFromSession(favorite.address);
    });

    item.innerHTML = `
      <span class="favorite-dot"></span>
      <span class="favorite-info"><strong>${escapeHtml(favorite.name)}</strong><small>${escapeHtml(favorite.address)}</small></span>
      <span class="favorite-status">${isActive ? t("status.connected") : (available ? t("connection.available") : t("connection.unavailable"))}</span>
    `;
    const actions = document.createElement("span");
    actions.className = "favorite-actions";
    actions.append(connectBtn, disconnectBtn);
    item.appendChild(actions);
    box.appendChild(item);
  }
}

function renderPeers(preferred = "") {
  const select = $("peer");
  const current = preferred || select.value;
  select.innerHTML = "";
  const list = [...peerCache.values()].sort((a,b) => a.name.localeCompare(b.name));
  if (!list.length) select.add(new Option(t("connection.none"), ""));
  for (const p of list) select.add(new Option(`${p.name} — ${p.address}`, p.address));
  if (current && [...select.options].some(o => o.value === current)) select.value = current;
  updateFavoriteButton();
  const add = $("addPeerToSession");
  if (add) add.disabled = !select.value || sessionPeers.has(select.value) || sessionPeers.size >= MAX_SESSION_REMOTES;
  renderFavorites();
  renderSessionMembers();
}

function persistSessionPeers() {
  const remotes = [...sessionPeers];
  localStorage.setItem(SESSION_KEY, JSON.stringify(remotes));
  emitTo("tray", "session-changed", { remotes }).catch(() => {});
}

function loadSessionPeers() {
  try {
    const stored = JSON.parse(localStorage.getItem(SESSION_KEY) || "[]");
    sessionPeers = new Set(Array.isArray(stored) ? stored.filter(Boolean).slice(0, MAX_SESSION_REMOTES) : []);
  } catch { sessionPeers = new Set(); }
}

function sessionLabel(address) {
  return peerCache.get(address)?.name || favoriteFor(address)?.name || `PC — ${address}`;
}

function renderSessionMembers() {
  const box = $("sessionMembers");
  if (!box) return;
  const members = [...sessionPeers];
  const remoteCount = members.length;
  const participantCount = remoteCount ? remoteCount + 1 : (connected ? connectedPeers.length + 1 : 1);
  const summary = remoteCount === 0
    ? t("group.none")
    : remoteCount === 1
      ? t("group.duoSummary", { count: participantCount })
      : t("group.groupSummary", { count: participantCount });
  if ($("sessionSummaryText")) $("sessionSummaryText").textContent = summary;
  if ($("sessionCount")) $("sessionCount").textContent = t("group.participantCount", { count: remoteCount ? participantCount : 0 });
  if ($("sessionState")) $("sessionState").textContent = `${connected ? connectedPeers.length + 1 : (remoteCount ? participantCount : 1)}`;
  box.innerHTML = "";

  if (!remoteCount) {
    box.innerHTML = `<div class="session-empty">${t("group.none")}</div>`;
  } else {
    for (const address of members) {
      const item = document.createElement("div");
      const active = connectedPeers.includes(address);
      const discovered = peerCache.has(address);
      const state = active ? (discovered ? t("status.connected") : t("group.reconnecting")) : (discovered ? t("connection.available") : t("connection.unavailable"));
      item.className = `session-member${active ? " active" : ""}${!discovered ? " missing" : ""}`;
      item.innerHTML = `<span class="session-member-dot"></span><span class="session-member-copy"><strong>${escapeHtml(sessionLabel(address))}</strong><small>${escapeHtml(address)}</small></span><span class="session-member-state">${escapeHtml(state)}</span>`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-btn compact session-remove";
      remove.innerHTML = UI_ICONS.x;
      remove.title = t("group.remove");
      remove.setAttribute("aria-label", remove.title);
      remove.addEventListener("click", (event) => { event.stopPropagation(); removePeerFromSession(address); });
      item.appendChild(remove);
      box.appendChild(item);
    }
  }
  const add = $("addPeerToSession");
  if (add) add.disabled = !$("peer").value || sessionPeers.has($("peer").value) || sessionPeers.size >= MAX_SESSION_REMOTES;
}

async function addSelectedPeerToSession() {
  const address = $("peer").value;
  if (!address) return;
  if (connected) {
    for (const current of connectedPeers) sessionPeers.add(current);
  }
  if (sessionPeers.has(address)) {
    toggleCompactPopover("sessionPopover");
    return;
  }
  if (sessionPeers.size >= MAX_SESSION_REMOTES) { setDetails(t("group.limit")); return; }
  sessionPeers.add(address);
  persistSessionPeers();
  renderSessionMembers();
  renderPeers(address);
  if (connected) await syncLiveSessionPeers();
  if ($("sessionPopover")?.classList.contains("hidden")) toggleCompactPopover("sessionPopover");
}

async function removePeerFromSession(address) {
  if (!address) return;
  if (connected) {
    for (const current of connectedPeers) sessionPeers.add(current);
  }
  sessionPeers.delete(address);
  persistSessionPeers();
  if (connected && connectedPeers.includes(address)) {
    if (sessionPeers.size) {
      await syncLiveSessionPeers();
    } else {
      await disconnect();
    }
  }
  renderSessionMembers();
  renderFavorites();
  renderPeers();
}

async function syncLiveSessionPeers() {
  if (!connected) return;
  const targets = [...sessionPeers];
  if (!targets.length) { await disconnect(); return; }
  try {
    connectedPeers = await invoke("set_audio_peers", { remotes: targets });
    connectedPeer = connectedPeers[0] || "";
    sessionPeers = new Set(connectedPeers);
    persistSessionPeers();
    await emitTo("tray", "audio-state-changed", { connected: true, remotes: connectedPeers });
    renderSessionMembers();
    renderFavorites();
  } catch (e) {
    reportError("Group update", e);
    setDetails(`Session : ${e}`);
  }
}


function sameAddressSet(left, right) {
  const a = [...new Set((left || []).filter(Boolean))].sort();
  const b = [...new Set((right || []).filter(Boolean))].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function roomMeta(room) {
  if (!room) return t("group.none");
  const host = room.host_name || t("group.hostUnavailable");
  return `${room.participants}/${room.max_participants} · ${t("group.host")}: ${host}`;
}

function updateHeaderStatus() {
  const status = $("status");
  if (!status) return;
  if (connected) {
    status.innerHTML = `<span class="status-dot"></span>${t("status.connected")}`;
    status.className = "status online";
  } else if (communicationMode === "group" && activeRoom) {
    status.innerHTML = `<span class="status-dot"></span>${t("group.waiting")}`;
    status.className = "status waiting";
  } else {
    status.innerHTML = `<span class="status-dot"></span>${t("status.offline")}`;
    status.className = "status offline";
  }
}

function updateConnectionInsights() {
  const peers = [...peerCache.values()].filter(peer => !peer.manual).length;
  const rooms = roomsCache.length;
  const network = `${peers} PC${peers === 1 ? "" : "s"} · ${rooms} ${t("group.roomsShort")}`;
  if ($("networkState")) $("networkState").textContent = network;
  if ($("stateNetwork")) $("stateNetwork").textContent = network;

  if ($("connectionSessionState")) {
    if (communicationMode === "group") {
      $("connectionSessionState").textContent = activeRoom
        ? `${activeRoom.name} · ${activeRoom.participants}/${activeRoom.max_participants}`
        : `${t("group.groupMode")} · ${t("group.none")}`;
    } else if (connectedPeers.length) {
      $("connectionSessionState").textContent = connectedPeers.length > 1
        ? `${t("group.groupMode")} · ${connectedPeers.length + 1}`
        : `${t("group.duo")} · ${connectedPeers.length + 1}`;
    } else {
      $("connectionSessionState").textContent = `${t("group.duo")} · ${t("status.offline")}`;
    }
  }

  if (communicationMode === "group") {
    $("mode").textContent = activeRoom ? `${t("group.roomLabel")} · ${activeRoom.name}` : t("group.groupMode");
    $("sessionState").textContent = activeRoom ? `${activeRoom.participants}/${activeRoom.max_participants}` : "0";
  }
}

function renderRooms() {
  const list = $("roomsList");
  if (!list) return;
  const visibleRooms = roomsCache.filter(room => room && room.id);
  $("roomNetworkCount").textContent = `${visibleRooms.length}`;
  list.innerHTML = "";

  if (!visibleRooms.length) {
    list.innerHTML = `<div class="rooms-empty">${escapeHtml(t("group.noRooms"))}</div>`;
  } else {
    for (const room of visibleRooms) {
      const active = activeRoom?.id === room.id;
      const full = room.participants >= room.max_participants && !active;
      const row = document.createElement("button");
      row.type = "button";
      row.className = `room-row${active ? " active" : ""}${full ? " full" : ""}`;
      row.disabled = full;
      row.innerHTML = `
        <span class="room-row-icon"><svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
        <span class="room-row-copy"><strong>${escapeHtml(room.name)}</strong><small>${escapeHtml(room.host_name || t("group.hostUnavailable"))}</small></span>
        <span class="room-row-count">${room.participants}/${room.max_participants}</span>
        <span class="room-row-action">${active ? escapeHtml(t("status.connected")) : full ? escapeHtml(t("group.full")) : escapeHtml(t("group.join"))}</span>`;
      if (!active && !full) row.addEventListener("click", () => joinNamedRoom(room.id));
      list.appendChild(row);
    }
  }

  const activeCard = $("activeRoomCard");
  if (activeRoom) {
    activeCard.classList.remove("hidden");
    $("activeRoomName").textContent = activeRoom.name;
    $("activeRoomMeta").textContent = roomMeta(activeRoom);
  } else {
    activeCard.classList.add("hidden");
  }
  updateHeaderStatus();
  updateConnectionInsights();
}

async function syncActiveRoomAudio(room = activeRoom) {
  if (!room || communicationMode !== "group" || roomSyncBusy) return;
  roomSyncBusy = true;
  try {
    const targets = (room.members || [])
      .filter(member => !member.is_self && member.address && member.address !== "127.0.0.1")
      .map(member => member.address)
      .slice(0, MAX_SESSION_REMOTES);

    if (!targets.length) {
      if (connected) await disconnect();
      updateConnectionInsights();
      return;
    }

    if (!connected) {
      await connectToAddresses(targets);
    } else if (!sameAddressSet(connectedPeers, targets)) {
      connectedPeers = await invoke("set_audio_peers", { remotes: targets });
      connectedPeer = connectedPeers[0] || "";
      await emitTo("tray", "audio-state-changed", { connected: true, remotes: connectedPeers });
      renderFavorites();
    }
    $("mode").textContent = `${t("group.roomLabel")} · ${room.name}`;
    $("sessionState").textContent = `${room.participants}/${room.max_participants}`;
  } catch (error) {
    reportError("Room audio sync", error);
    setDetails(`${t("group.roomLabel")} : ${String(error)}`);
  } finally {
    roomSyncBusy = false;
  }
}

async function refreshRooms(syncAudio = true) {
  try {
    const previousRoomId = activeRoom?.id || null;
    const [rooms, localRoom] = await Promise.all([
      invoke("list_rooms"),
      invoke("get_local_room"),
    ]);
    roomsCache = Array.isArray(rooms) ? rooms : [];
    activeRoom = localRoom || null;
    if (previousRoomId && !activeRoom && communicationMode === "group") {
      if (connected) await disconnect();
      setDetails(t("group.closed"));
      await emitTo("tray", "room-state-changed", { room: null }).catch(() => {});
    }
    renderRooms();
    if (communicationMode === "group" && !$("mainView").classList.contains("hidden")) {
      const preferredHeight = preferredMainWindowHeight();
      if (preferredHeight !== currentDesignHeight) await resizeDesignWindow(preferredHeight).catch(() => {});
    }
    if (syncAudio && activeRoom && communicationMode === "group") await syncActiveRoomAudio(activeRoom);
  } catch (error) {
    reportError("Room discovery", error);
  }
}

async function createNamedRoom() {
  const input = $("roomName");
  const name = input.value.trim();
  if (!name) { input.focus(); return; }
  const button = $("createRoom");
  button.disabled = true;
  try {
    if (connected) await disconnect();
    if (activeRoom) await invoke("leave_room");
    activeRoom = await invoke("create_room", { name });
    input.value = "";
    setDetails(t("group.created", { name: activeRoom.name }));
    await refreshRooms(true);
    await emitTo("tray", "room-state-changed", { room: activeRoom });
  } catch (error) {
    reportError("Create room", error);
    setDetails(`${t("group.createFailed")} : ${String(error)}`);
  } finally { button.disabled = false; }
}

async function joinNamedRoom(roomId) {
  if (!roomId || activeRoom?.id === roomId) return;
  try {
    if (connected) await disconnect();
    if (activeRoom) await invoke("leave_room");
    activeRoom = await invoke("join_room", { roomId });
    setDetails(t("group.joined", { name: activeRoom.name }));
    await refreshRooms(true);
    await emitTo("tray", "room-state-changed", { room: activeRoom });
  } catch (error) {
    reportError("Join room", error);
    setDetails(`${t("group.joinFailed")} : ${String(error)}`);
    await refreshRooms(false);
  }
}

async function leaveActiveRoom({ keepMode = false } = {}) {
  try { await invoke("leave_room"); } catch (error) { reportError("Leave room", error); }
  activeRoom = null;
  roomsCache = roomsCache.map(room => ({ ...room, is_local: false }));
  if (connected) await disconnect();
  renderRooms();
  setDetails(t("group.left"));
  await emitTo("tray", "room-state-changed", { room: null }).catch(() => {});
  if (!keepMode) await refreshRooms(false);
}

async function setCommunicationMode(mode, { initial = false } = {}) {
  const target = mode === "group" ? "group" : "duo";
  if (!initial && target === communicationMode) return;

  if (!initial && target === "duo" && activeRoom) await leaveActiveRoom({ keepMode: true });
  if (!initial && target === "group" && connected && !activeRoom) await disconnect();

  communicationMode = target;
  localStorage.setItem(COMMUNICATION_MODE_KEY, target);
  $("modeDuo").classList.toggle("active", target === "duo");
  $("modeGroup").classList.toggle("active", target === "group");
  $("duoPanel").classList.toggle("hidden", target !== "duo");
  $("groupPanel").classList.toggle("hidden", target !== "group");
  closeCompactPopovers();

  if (target === "group") await refreshRooms(true);
  else {
    $("mode").textContent = connectedPeers.length > 1 ? `${t("group.groupMode")} · ${connectedPeers.length + 1}` : t("state.lan");
    renderSessionMembers();
  }
  updateConnectionInsights();
  if (!$("mainView").classList.contains("hidden")) {
    await resizeDesignWindow(preferredMainWindowHeight()).catch(() => {});
  }
}

function toggleFavorite() {
  const address = $("peer").value;
  if (!address) return;
  const favorites = loadFavorites();
  const index = favorites.findIndex(f => f.address === address);
  if (index >= 0) {
    favorites.splice(index, 1);
    saveFavorites(favorites);
    setDetails(t("connection.favoriteRemoved"));
  } else {
    const peer = peerCache.get(address);
    const name = peer?.name || `PC — ${address}`;
    favorites.push({ name, address });
    saveFavorites(favorites);
    setDetails(t("connection.favoriteAdded", { name }));
  }
  updateFavoriteButton();
  renderFavorites();
}

async function loadAutostart() {
  try { $("autostart").checked = await isAutostartEnabled(); }
  catch (e) { reportError("Autostart status", e); $("autostartDetails").textContent = `Autostart indisponible : ${e}`; }
}

function loadAudioPreferences() {
  const savedVolume = Math.max(0, Math.min(200, Number(localStorage.getItem(VOLUME_KEY) ?? 100)));
  const boost = localStorage.getItem(BOOST_KEY) === "true";
  const muted = localStorage.getItem(MUTE_KEY) === "true";
  $("boostVolume").checked = boost;
  $("volume").max = boost ? 200 : 100;
  $("volume").value = boost ? savedVolume : Math.min(savedVolume, 100);
  updateVolumeUi();
  updateMuteUi(muted);
  applyVolume();
  invoke("set_mute", { muted }).catch(e => reportError("Mute restore", e));
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
  $("noiseStatus").textContent = enabled ? `${t("audio.enabled")} · ${intensity}%` : t("audio.disabled");
  $("savedNoise").textContent = enabled ? `${t("audio.enabled")} · ${intensity}%` : t("audio.disabled");
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
    reportError("Noise reduction", e);
    setDetails(`Réduction de bruit : ${e}`);
  }
}

async function applyVolume() {
  const volume = Number($("volume").value) / 100;
  try { await invoke("set_volume", { volume }); }
  catch (e) { reportError("Volume", e); setDetails(`Volume : ${e}`); }
}

function updateMuteUi(muted) {
  $("muteText").textContent = muted ? t("audio.unmute") : t("audio.mute");
  $("mute").classList.toggle("active", muted);
}

async function loadDevices() {
  try {
    const devices = await invoke("list_devices");
    const input = $("input"), output = $("output");
    input.innerHTML = ""; output.innerHTML = "";
    for (const d of devices.inputs) input.add(new Option(d, d));
    for (const d of devices.outputs) output.add(new Option(d, d));
    deviceDefaults = { input: devices.default_input || null, output: devices.default_output || null };
    const savedInput = localStorage.getItem("duovoice.input");
    const savedOutput = localStorage.getItem("duovoice.output");
    if (savedInput && [...input.options].some(o => o.value === savedInput)) input.value = savedInput;
    else if (deviceDefaults.input && [...input.options].some(o => o.value === deviceDefaults.input)) input.value = deviceDefaults.input;
    if (savedOutput && [...output.options].some(o => o.value === savedOutput)) output.value = savedOutput;
    else if (deviceDefaults.output && [...output.options].some(o => o.value === deviceDefaults.output)) output.value = deviceDefaults.output;
    appliedInputDevice = input.value || null;
    appliedOutputDevice = output.value || null;
    } catch (e) { reportError("Audio devices", e); setDetails(`Audio indisponible : ${e}`); }
}

async function restartAudioWithCurrentDevices(detailText = "Audio updated.") {
  const selectedInput = $("input").value || null;
  const selectedOutput = $("output").value || null;
  if (!connected || !connectedPeers.length) {
    appliedInputDevice = selectedInput;
    appliedOutputDevice = selectedOutput;
    localStorage.setItem("duovoice.input", $("input").value);
    localStorage.setItem("duovoice.output", $("output").value);
    setDetails(detailText);
    return true;
  }
  await invoke("start_audio", { remote: connectedPeers[0], remotes: connectedPeers, input: selectedInput, output: selectedOutput });
  appliedInputDevice = selectedInput;
  appliedOutputDevice = selectedOutput;
  localStorage.setItem("duovoice.input", $("input").value);
  localStorage.setItem("duovoice.output", $("output").value);
  await applyVolume();
  await emitTo("tray", "audio-state-changed", { connected: true, remotes: connectedPeers });
  setDetails(detailText);
  return true;
}

function recordRecentConnections(addresses) {
  const now = Date.now();
  let recent = [];
  try { recent = JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]"); } catch {}
  if (!Array.isArray(recent)) recent = [];
  for (const address of addresses) {
    recent = recent.filter(item => item.address !== address);
    recent.unshift({ address, name: sessionLabel(address), lastConnected: now });
    const favorites = loadFavorites();
    const favorite = favorites.find(item => item.address === address);
    if (favorite) { favorite.lastConnected = now; saveFavorites(favorites); }
  }
  localStorage.setItem(RECENTS_KEY, JSON.stringify(recent.slice(0, MAX_SESSION_REMOTES)));
  renderRecentConnections();
}

function renderRecentConnections() {
  const box = $("recentConnections");
  if (!box) return;
  let recent = [];
  try { recent = JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]"); } catch {}
  if (!Array.isArray(recent) || !recent.length) { box.innerHTML = `<div class="favorites-empty">${t("recent.empty")}</div>`; return; }
  box.innerHTML = "";
  for (const item of recent.slice(0, 5)) {
    const row = document.createElement("div");
    row.className = "recent-item";
    const date = new Date(item.lastConnected || 0).toLocaleString(localeForLanguage(), { dateStyle: "short", timeStyle: "short" });
    row.innerHTML = `<span><strong>${escapeHtml(item.name || item.address)}</strong><small>${escapeHtml(item.address)}</small></span><span class="recent-date">${escapeHtml(date)}</span>`;
    const button = document.createElement("button");
    button.type = "button"; button.className = "favorite-action"; button.innerHTML = UI_ICONS.link; button.title = t("connection.connect");
    button.addEventListener("click", () => connectToAddress(item.address));
    row.appendChild(button); box.appendChild(row);
  }
}

async function refreshDiagnostics() {
  const button = $("refreshDiagnostics");
  if (button) { button.disabled = true; button.classList.add("is-spinning"); }
  try {
    const d = await invoke("get_diagnostics");
    $("diagComputer").textContent = `${d.client_name} · ${d.computer_name}`;
    $("diagIp").textContent = d.local_ipv4 || "Unavailable";
    $("diagPorts").textContent = `UDP ${d.discovery_port} / ${d.audio_port}`;
    $("diagEngine").textContent = d.audio_running ? `${t("status.connected")} · ${d.volume_percent}%${d.muted ? " · muted" : ""}` : t("status.offline");
    $("diagPeers").textContent = d.session_peers.length ? d.session_peers.join(", ") : `0 · ${d.discovered_peers} detected`;
    $("diagDevices").textContent = `${d.input_device || "—"} → ${d.output_device || "—"}`;
    $("diagLog").textContent = d.log_path || "—";
  } catch (e) {
    reportError("Diagnostics", e);
    $("diagEngine").textContent = String(e);
  } finally {
    if (button) { button.disabled = false; button.classList.remove("is-spinning"); }
  }
}

async function loadPeers(manual = false) {
  const refresh = $("refresh");
  if (manual) {
    refresh.disabled = true;
    refresh.classList.add("is-spinning");
    setDetails("Recherche des ordinateurs…");
  }
  try {
    const peers = await invoke("list_peers");
    const now = Date.now();
    let favoritesChanged = false;
    const favorites = loadFavorites();
    for (const p of peers) {
      const old = peerCache.get(p.address);
      peerCache.set(p.address, { ...p, seenAt: now, manual: old?.manual ?? false });
      const favorite = favorites.find(item => item.address === p.address);
      if (favorite && favorite.name !== p.name) {
        favorite.name = p.name;
        favoritesChanged = true;
      }
    }
    if (favoritesChanged) saveFavorites(favorites);
    for (const [address, p] of peerCache) if (!p.manual && now - p.seenAt > 15000) peerCache.delete(address);
    renderPeers();
    renderFavorites();
    renderSessionMembers();
    updateConnectionInsights();
    if (manual) setDetails(peers.length ? `${peers.length} ordinateur(s) disponible(s).` : "Aucun PC détecté. Vous pouvez ajouter une IP manuellement.");
  } catch (e) { reportError("Peer discovery", e); setDetails(`Détection réseau : ${e}`); }
  finally {
    if (manual) {
      refresh.disabled = false;
      refresh.classList.remove("is-spinning");
      refresh.classList.add("success-flash");
      setTimeout(() => refresh.classList.remove("success-flash"), 650);
    }
  }
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
  if (!connected || !connectedPeers.length) { el.textContent = "— ms"; return; }
  try {
    const values = await Promise.all(connectedPeers.map(remote => invoke("measure_latency", { remote }).catch(() => null)));
    const valid = values.map(Number).filter(Number.isFinite);
    if (!valid.length) { el.textContent = "…"; return; }
    const average = Math.round(valid.reduce((a,b) => a+b, 0) / valid.length);
    el.textContent = connectedPeers.length > 1 ? `${average} ms avg` : `${average} ms`;
  } catch { el.textContent = "…"; }
}

async function connectToAddresses(addresses) {
  const targets = [...new Set(addresses.filter(Boolean))].slice(0, MAX_SESSION_REMOTES);
  if (!targets.length || disconnecting) return;
  const button = $("connect");
  button.disabled = true;
  try {
    if (connected) await disconnect();
    setDetails(`Connexion à ${targets.length} ordinateur(s)…`);
    await invoke("start_audio", { remote: targets[0], remotes: targets, input: $("input").value || null, output: $("output").value || null });
    appliedInputDevice = $("input").value || null;
    appliedOutputDevice = $("output").value || null;
    await applyVolume();
    connected = true;
    connectedPeers = targets;
    connectedPeer = targets[0];
    if (!(communicationMode === "group" && activeRoom)) {
      sessionPeers = new Set(targets);
      persistSessionPeers();
    }
    $("peer").value = connectedPeer;
    button.textContent = t("connection.disconnect");
    button.classList.add("disconnect-state");
    updateHeaderStatus();
    $("mode").textContent = communicationMode === "group" && activeRoom
      ? `${t("group.roomLabel")} · ${activeRoom.name}`
      : (targets.length > 1 ? `${t("group.groupMode")} · ${targets.length + 1}` : t("state.lan"));
    setDetails(communicationMode === "group" && activeRoom
      ? `${activeRoom.name} · ${targets.length + 1}/${MAX_SESSION_PARTICIPANTS} · ${t("state.active")}`
      : (targets.length > 1 ? `${targets.length} machines · ${t("state.active")}` : t("state.active")));
    recordRecentConnections(targets);
    renderSessionMembers();
    renderFavorites();
    updateConnectionInsights();
    await emitTo("tray", "audio-state-changed", { connected: true, remotes: targets });
    await updateLatency();
  } catch (e) {
    connected = false; connectedPeers = []; connectedPeer = "";
    button.textContent = t("connection.connect");
    button.classList.remove("disconnect-state");
    updateHeaderStatus();
    $("mode").textContent = communicationMode === "group" && activeRoom ? `${t("group.roomLabel")} · ${activeRoom.name}` : t("state.lan");
    reportError("Audio connect", e);
    setDetails(`Connexion impossible : ${e}`);
    renderSessionMembers(); renderFavorites(); updateConnectionInsights();
  } finally { button.disabled = false; }
}

async function connectToAddress(address) {
  if (!address) return;
  await connectToAddresses([address]);
}

async function disconnect() {
  if (disconnecting) return;
  disconnecting = true;
  const hadPeers = connectedPeers.length;
  connected = false; connectedPeers = []; connectedPeer = "";
  $("connect").textContent = t("connection.connect");
  $("connect").classList.remove("disconnect-state");
  updateHeaderStatus();
  $("latency").textContent = "— ms";
  $("mode").textContent = communicationMode === "group" && activeRoom ? `${t("group.roomLabel")} · ${activeRoom.name}` : t("state.lan");
  renderSessionMembers(); renderFavorites(); updateConnectionInsights();
  try {
    await invoke("stop_audio");
    await emitTo("tray", "audio-state-changed", { connected: false });
    setDetails(hadPeers ? t("state.disconnected") : t("state.disconnected"));
  } catch (e) {
    reportError("Audio disconnect", e);
    setDetails(`Déconnexion : ${e}`);
  } finally { disconnecting = false; renderFavorites(); updateConnectionInsights(); refreshDiagnostics(); }
}

async function connect() {
  if (connected) {
    const button = $("connect"); button.disabled = true;
    try { await disconnect(); } finally { button.disabled = false; }
    return;
  }
  const selected = $("peer").value;
  const targets = sessionPeers.size > 1
    ? [...sessionPeers]
    : (selected ? [selected] : [...sessionPeers]);
  if (!targets.length) { setDetails("Sélectionnez un ordinateur ou ajoutez une IP."); return; }
  await connectToAddresses(targets);
}


let updateChecking = false;

async function setUpdateBanner(status, update = null, error = "") {
  updateState = { status, update };
  const banner = $("updateBanner");
  if (!banner) return;
  banner.className = `update-banner ${status}`;
  banner.disabled = false;
  banner.onclick = null;
  banner.title = "";

  if (status === "checking") {
    banner.innerHTML = iconLabel(UI_ICONS.refresh, t("update.checking"));
    banner.disabled = true;
  } else if (status === "current") {
    banner.innerHTML = iconLabel(UI_ICONS.check, t("update.current"));
    banner.onclick = checkForUpdates;
    banner.title = "Cliquer pour lancer une nouvelle vérification.";
  } else if (status === "available") {
    banner.innerHTML = iconLabel(UI_ICONS.download, t("update.available", { version: update.version }));
    banner.onclick = installUpdate;
    banner.title = `Télécharger et installer DuoVoice v${update.version}`;
  } else {
    banner.innerHTML = iconLabel(UI_ICONS.alert, t("update.error"));
    banner.onclick = checkForUpdates;
    banner.title = error || "Vérification impossible";
  }
}

async function checkForUpdates() {
  if (updateChecking) return;
  updateChecking = true;
  await setUpdateBanner("checking");
  setDetails("Recherche des mises à jour…");

  try {
    const update = await check({ timeout: 10_000 });
    if (update) {
      await setUpdateBanner("available", update);
      setDetails(`Mise à jour v${update.version} disponible.`);
    } else {
      await setUpdateBanner("current");
      setDetails(`Vérification terminée à ${new Date().toLocaleTimeString(localeForLanguage(), { hour: "2-digit", minute: "2-digit" })} : aucune mise à jour disponible.`);
    }
  } catch (e) {
    reportError("Updater check", e);
    await setUpdateBanner("error", null, String(e));
    setDetails(`Vérification des mises à jour impossible : ${String(e)}`);
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
  banner.innerHTML = iconLabel(UI_ICONS.refresh, `Préparation de v${update.version}…`);
  setDetails(`Préparation du téléchargement de v${update.version}…`);

  try {
    let downloaded = 0;
    let total = 0;

    // Separate download and install so an error can be identified precisely.
    await update.download((event) => {
      if (event.event === "Started") {
        total = Number(event.data.contentLength || 0);
        downloaded = 0;
        banner.innerHTML = iconLabel(UI_ICONS.download, total > 0 ? `Téléchargement de v${update.version} · 0%` : `Téléchargement de v${update.version}…`);
        setDetails(total > 0 ? `Téléchargement de la mise à jour… 0%` : "Téléchargement de la mise à jour…");
      } else if (event.event === "Progress") {
        downloaded += Number(event.data.chunkLength || 0);
        if (total > 0) {
          const percent = Math.min(100, Math.round((downloaded / total) * 100));
          banner.innerHTML = iconLabel(UI_ICONS.download, `Téléchargement de v${update.version} · ${percent}%`);
          setDetails(`Téléchargement de la mise à jour… ${percent}%`);
        }
      } else if (event.event === "Finished") {
        banner.innerHTML = iconLabel(UI_ICONS.refresh, `Installation de v${update.version}…`);
        setDetails("Téléchargement terminé. Vérification de la mise à jour…");
      }
    }, { timeout: 120000 });

    banner.innerHTML = iconLabel(UI_ICONS.refresh, `Installation de v${update.version}…`);
    setDetails("Téléchargement terminé. Installation de la mise à jour…");
    await update.install();

  } catch (e) {
    const message = String(e);
    banner.disabled = false;
    await setUpdateBanner("available", update);
    reportError("Updater install", e);
    setDetails(`Mise à jour impossible : ${message}`);
    console.error("DuoVoice updater error:", e, update.rawJson || update);
  }
}

$("connect").addEventListener("click", connect);
$("refresh").addEventListener("click", async () => { await loadPeers(true); if (communicationMode === "group") await refreshRooms(false); });
$("modeDuo").addEventListener("click", () => setCommunicationMode("duo"));
$("modeGroup").addEventListener("click", () => setCommunicationMode("group"));
$("createRoom").addEventListener("click", createNamedRoom);
$("roomName").addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); createNamedRoom(); } });
$("leaveRoom").addEventListener("click", () => leaveActiveRoom());
$("favoriteBtn").addEventListener("click", toggleFavorite);
$("peer").addEventListener("change", () => { updateFavoriteButton(); renderSessionMembers(); });
$("addPeerToSession").addEventListener("click", addSelectedPeerToSession);
$("sessionSummary").addEventListener("click", (event) => { event.stopPropagation(); toggleCompactPopover("sessionPopover"); });
$("favoritesSummary").addEventListener("click", (event) => { event.stopPropagation(); toggleCompactPopover("favoritesPopover"); });
$("closeSessionPopover").addEventListener("click", (event) => { event.stopPropagation(); closeCompactPopovers(); });
$("closeFavoritesPopover").addEventListener("click", (event) => { event.stopPropagation(); closeCompactPopovers(); });
$("sessionPopover").addEventListener("click", event => event.stopPropagation());
$("favoritesPopover").addEventListener("click", event => event.stopPropagation());
$("addIp").addEventListener("click", addManualIp);
$("manualIp").addEventListener("keydown", e => { if (e.key === "Enter") addManualIp(); });
$("saveClientName").addEventListener("click", saveClientName);
$("clientName").addEventListener("input", () => updateClientNameVisual());
$("clientName").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); saveClientName(); } });

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

$("micMonitor").addEventListener("click", toggleMicMonitor);
$("testAudio").addEventListener("click", runAudioTest);
$("openDiagnostics").addEventListener("click", openDiagnosticsPanel);

$("mute").addEventListener("click", async () => {
  try {
    const muted = await invoke("toggle_mute");
    localStorage.setItem(MUTE_KEY, String(muted));
    updateMuteUi(muted);
    await emitTo("tray", "audio-state-changed", { muted });
  } catch (e) { reportError("Mute", e); setDetails(`Muet : ${e}`); }
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
  if (!event.target.closest(".compact-list-anchor")) closeCompactPopovers();
});

async function runAudioTest() {
  const button = $("testAudio");
  if (!button || button.disabled) return;
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `${UI_ICONS.refresh}<span>${t("audio.testing")}</span>`;
  try {
    await invoke("test_audio_output", { output: $("output").value || null });
    setDetails(t("audio.testDone"));
  } catch (error) {
    reportError("Audio test", error);
    setDetails(`${t("audio.testFailed")} : ${String(error)}`);
  } finally {
    button.innerHTML = original;
    button.disabled = false;
  }
}


function updateMicMonitorUi(active, level = 0) {
  micMonitorActive = Boolean(active);
  const button = $("micMonitor");
  if (!button) return;
  button.classList.toggle("monitoring", micMonitorActive);
  $("micMonitorText").textContent = micMonitorActive ? t("audio.monitoring") : t("audio.monitor");
  const normalized = Math.max(0, Math.min(1, Number(level) || 0));
  $("micMeterFill").style.width = `${Math.round(Math.min(1, normalized * 3.2) * 100)}%`;
}

async function pollMicMonitor() {
  if (!micMonitorActive) return;
  try {
    const status = await invoke("mic_monitor_status");
    updateMicMonitorUi(Boolean(status.active), Number(status.level) || 0);
    if (!status.active && micMonitorTimer) {
      clearInterval(micMonitorTimer);
      micMonitorTimer = null;
    }
  } catch (error) {
    reportError("Microphone monitor status", error);
  }
}

async function startMicMonitor() {
  try {
    await invoke("start_mic_monitor", { input: $("input").value || null, output: $("output").value || null });
    updateMicMonitorUi(true, 0);
    if (micMonitorTimer) clearInterval(micMonitorTimer);
    micMonitorTimer = setInterval(pollMicMonitor, 120);
    setDetails(t("audio.monitorHint"));
  } catch (error) {
    updateMicMonitorUi(false, 0);
    reportError("Microphone monitor", error);
    setDetails(`${t("audio.monitorFailed")} : ${String(error)}`);
  }
}

async function stopMicMonitor({ announce = true } = {}) {
  try { await invoke("stop_mic_monitor"); }
  catch (error) { reportError("Stop microphone monitor", error); }
  if (micMonitorTimer) { clearInterval(micMonitorTimer); micMonitorTimer = null; }
  updateMicMonitorUi(false, 0);
  if (announce) setDetails(t("audio.monitorStopped"));
}

async function toggleMicMonitor() {
  const button = $("micMonitor");
  if (!button || button.disabled) return;
  button.disabled = true;
  try {
    if (micMonitorActive) await stopMicMonitor();
    else await startMicMonitor();
  } finally { button.disabled = false; }
}

function openDiagnosticsPanel() {
  closeCompactPopovers();
  showSettings();
  requestAnimationFrame(() => {
    $("diagnosticsCard")?.scrollIntoView({ behavior: "smooth", block: "start" });
    refreshDiagnostics();
  });
}

async function applyAudioDeviceChange(kind) {
  const inputEl = $("input");
  const outputEl = $("output");
  const selectedInput = inputEl.value || null;
  const selectedOutput = outputEl.value || null;

  if (!connected || !connectedPeers.length) {
    appliedInputDevice = selectedInput;
    appliedOutputDevice = selectedOutput;
    localStorage.setItem("duovoice.input", inputEl.value);
    localStorage.setItem("duovoice.output", outputEl.value);
    return;
  }
  if (switchingAudioDevice) return;
  switchingAudioDevice = true; inputEl.disabled = true; outputEl.disabled = true;
  const previousInput = appliedInputDevice, previousOutput = appliedOutputDevice;
  const label = kind === "input" ? "source audio" : "sortie audio";
  setDetails(`Changement de ${label}…`);
  try {
    await restartAudioWithCurrentDevices(`${kind === "input" ? "Source" : "Sortie"} audio changée sans déconnexion.`);
  } catch (error) {
    reportError("Audio device hot switch", error);
    let restored = false;
    try {
      if (previousInput && [...inputEl.options].some(o => o.value === previousInput)) inputEl.value = previousInput;
      if (previousOutput && [...outputEl.options].some(o => o.value === previousOutput)) outputEl.value = previousOutput;
      await invoke("start_audio", { remote: connectedPeers[0], remotes: connectedPeers, input: previousInput, output: previousOutput });
      appliedInputDevice = previousInput; appliedOutputDevice = previousOutput; restored = true;
    } catch (rollbackError) { reportError("Audio device rollback", rollbackError); }
    if (restored) {
      localStorage.setItem("duovoice.input", inputEl.value); localStorage.setItem("duovoice.output", outputEl.value); await applyVolume();
      setDetails("Impossible d'utiliser ce périphérique. L'ancien périphérique a été restauré.");
    } else { await refreshFromTray(); setDetails(`Changement audio impossible : ${error}`); }
  } finally { inputEl.disabled = false; outputEl.disabled = false; switchingAudioDevice = false; }
}

$("input").addEventListener("change", async () => { if (micMonitorActive) await stopMicMonitor({ announce: false }); await applyAudioDeviceChange("input"); });
$("output").addEventListener("change", async () => { if (micMonitorActive) await stopMicMonitor({ announce: false }); await applyAudioDeviceChange("output"); });
$("refreshDiagnostics").addEventListener("click", refreshDiagnostics);

$("languageSelect").value = getLanguage();
$("languageSelect").addEventListener("change", async () => {
  const language = applyLanguageUi($("languageSelect").value, { broadcast: true });
  setDetails(t("language.changed", {}, language));
});

$("settingsBtn").addEventListener("click", () => {
  if ($("settingsView").classList.contains("hidden")) showSettings(); else showMain();
});
$("quitBtn").addEventListener("click", () => setAppQuitConfirmation(true));
$("cancelAppQuit").addEventListener("click", () => setAppQuitConfirmation(false));
$("confirmAppQuit").addEventListener("click", confirmAppQuit);
$("appQuitConfirm").addEventListener("click", event => {
  if (event.target === $("appQuitConfirm")) setAppQuitConfirmation(false);
});
$("versionSelector").addEventListener("click", openVersionPicker);
$("closeVersionPicker").addEventListener("click", () => { if (!rollbackBusy) setVersionPicker(false); });
$("cancelRollback").addEventListener("click", () => {
  rollbackVersion = "";
  rollbackName = "";
  $("versionRollbackConfirm").classList.add("hidden");
  $("versionPickerStatus").textContent = "";
});
$("confirmRollback").addEventListener("click", installPreviousVersion);
$("versionPicker").addEventListener("click", event => {
  if (event.target === $("versionPicker") && !rollbackBusy) setVersionPicker(false);
});
document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  if (!$("sessionPopover")?.classList.contains("hidden") || !$("favoritesPopover")?.classList.contains("hidden")) {
    closeCompactPopovers();
    return;
  }
  if ($("versionPicker").classList.contains("open") && !rollbackBusy) {
    setVersionPicker(false);
    return;
  }
  if ($("appQuitConfirm").classList.contains("open")) setAppQuitConfirmation(false);
});
bindGithubLink($("githubBrand"));
loadAppVersion();
$("uiScale").addEventListener("input", () => {
  setUiScaleControl($("uiScale").value);
  updateScaleActionsState();
});
$("trayScale").addEventListener("input", () => {
  setTrayScaleControl($("trayScale").value);
  updateScaleActionsState();
});
$("applyUiScale").addEventListener("click", async () => {
  const button = $("applyUiScale");
  button.disabled = true;
  button.textContent = ({en:"Applying…",fr:"Application…",es:"Aplicando…",de:"Wird angewendet…"})[getLanguage()];
  const results = await Promise.all([applyUiScale($("uiScale").value), applyTrayScale($("trayScale").value)]);
  updateScaleActionsState(results.every(Boolean));
  if (results.every(Boolean)) {
    setDetails(`✓ Échelles appliquées — application : ${$("uiScaleValue").textContent}, systray : ${$("trayScaleValue").textContent}.`);
  }
});
$("resetUiScale").addEventListener("click", resetUiScale);
updateHeaderMode();

$("autostart").addEventListener("change", async e => {
  try {
    if (e.target.checked) await enableAutostart(); else await disableAutostart();
    $("autostartDetails").textContent = e.target.checked ? t("autostart.enabled") : t("autostart.disabled");
  } catch (err) {
    reportError("Autostart", err);
    e.target.checked = await isAutostartEnabled().catch(() => false);
    $("autostartDetails").textContent = `Impossible de modifier l'autostart : ${err}`;
  }
});

$("startHidden").checked = localStorage.getItem("duovoice.startHidden") === "true";
const storedTrayIconPreference = localStorage.getItem(TRAY_ICON_KEY);
$("trayIconEnabled").checked = storedTrayIconPreference === null
  ? DEFAULT_TRAY_ICON_ENABLED
  : storedTrayIconPreference !== "false";
$("closeAction").value = localStorage.getItem("duovoice.closeAction") || DEFAULT_CLOSE_ACTION;

function updateTrayPreferenceDependencies() {
  const enabled = $("trayIconEnabled").checked;
  $("startHidden").disabled = !enabled;
  const trayOption = $("closeAction").querySelector('option[value="tray"]');
  if (trayOption) trayOption.disabled = !enabled;
}

async function applyTrayIconPreference(enabled, announce = false) {
  const desired = Boolean(enabled);
  const previousStored = localStorage.getItem(TRAY_ICON_KEY) !== "false";

  try {
    // Apply the native tray state first. A transient backend failure must never
    // overwrite the user's persisted preference.
    await invoke("set_tray_icon_enabled", { enabled: desired });

    localStorage.setItem(TRAY_ICON_KEY, String(desired));
    $("trayIconEnabled").checked = desired;

    // Without a tray icon, hiding the main window would make DuoVoice
    // impossible to reopen. Keep dependent settings safe and explicit.
    if (!desired) {
      $("startHidden").checked = false;
      localStorage.setItem("duovoice.startHidden", "false");
      if ($("closeAction").value === "tray") {
        $("closeAction").value = "quit";
        localStorage.setItem("duovoice.closeAction", "quit");
        await invoke("set_close_action", { action: "quit" }).catch(e => reportError("Close action", e));
      }
    }

    updateTrayPreferenceDependencies();
    if (announce) {
      $("autostartDetails").textContent = desired ? t("trayIcon.enabled") : t("trayIcon.disabled");
    }
    return true;
  } catch (e) {
    reportError("Tray icon", e);
    // Restore the UI from the last known persisted value, but do not rewrite it.
    $("trayIconEnabled").checked = previousStored;
    updateTrayPreferenceDependencies();
    $("autostartDetails").textContent = `Impossible de modifier l’icône du systray : ${e}`;
    return false;
  }
}

async function applyWindowPreferences() {
  const closeAction = $("closeAction").value;
  try { await invoke("set_close_action", { action: closeAction }); }
  catch (e) { setDetails(`Réglage fermeture : ${e}`); }

  try {
    if ($("startHidden").checked) await invoke("hide_window_to_tray");
    else await invoke("show_main_window", { settings: false });
  } catch (e) {
    setDetails(`Affichage de DuoVoice impossible : ${e}`);
  }
}

$("startHidden").addEventListener("change", () => {
  localStorage.setItem("duovoice.startHidden", String($("startHidden").checked));
});

$("trayIconEnabled").addEventListener("change", async () => {
  await applyTrayIconPreference($("trayIconEnabled").checked, true);
});

$("closeAction").addEventListener("change", async () => {
  const value = $("closeAction").value;
  localStorage.setItem("duovoice.closeAction", value);
  try { await invoke("set_close_action", { action: value }); }
  catch (e) { setDetails(`Réglage fermeture : ${e}`); }
});

async function initializeWindow() {
  loadUiScale();
  updateTrayPreferenceDependencies();

  // Non-critical UI setup must never prevent the main window from being
  // shown. This keeps startup reliable even if one optional Tauri operation
  // temporarily fails.
  await Promise.allSettled([
    applyUiScale($("uiScale").value),
    applyTrayScale($("trayScale").value),
  ]);

  await applyTrayIconPreference($("trayIconEnabled").checked, false);
  await applyWindowPreferences();
}

initializeWindow().catch(e => {
  reportError("Window initialization", e);
  setDetails(`Initialisation de la fenêtre impossible : ${e}`);
});

// Consistent tactile/visual feedback for compact clickable controls.
document.addEventListener("click", event => {
  const button = event.target.closest("button.icon-btn, button.add-btn, button.favorite-action, button.color-choice, button.noise-presets button");
  if (!button || button.disabled || button.id === "refresh" || button.id === "saveClientName") return;
  button.classList.remove("click-feedback");
  void button.offsetWidth;
  button.classList.add("click-feedback");
  setTimeout(() => button.classList.remove("click-feedback"), 320);
});

listen("open-settings", showSettings).catch(() => {});
listen("open-main", showMain).catch(() => {});

async function refreshFromTray() {
  try {
    const state = await invoke("audio_status");
    connected = Boolean(state.connected);
    connectedPeers = Array.isArray(state.remotes) ? state.remotes : (state.remote ? [state.remote] : []);
    connectedPeer = connectedPeers[0] || "";
    if (connected) {
      if (appliedInputDevice === null) appliedInputDevice = $("input").value || localStorage.getItem("duovoice.input") || null;
      if (appliedOutputDevice === null) appliedOutputDevice = $("output").value || localStorage.getItem("duovoice.output") || null;
      if (!(communicationMode === "group" && activeRoom)) {
        sessionPeers = new Set(connectedPeers);
        persistSessionPeers();
      }
    } else { appliedInputDevice = null; appliedOutputDevice = null; }
    const muted = Boolean(state.muted);
    localStorage.setItem(MUTE_KEY, String(muted)); updateMuteUi(muted);
    $("connect").textContent = connected ? t("connection.disconnect") : t("connection.connect");
    $("connect").classList.toggle("disconnect-state", connected);
    updateHeaderStatus();
    $("mode").textContent = communicationMode === "group" && activeRoom
      ? `${t("group.roomLabel")} · ${activeRoom.name}`
      : (connectedPeers.length > 1 ? `${t("group.groupMode")} · ${connectedPeers.length + 1}` : t("state.lan"));
    if (connectedPeer) $("peer").value = connectedPeer;
    await loadPeers(false);
    if (communicationMode === "group") await refreshRooms(false);
    await updateLatency(); renderSessionMembers(); renderFavorites(); updateConnectionInsights(); refreshDiagnostics();
  } catch {}
}

listen("audio-state-changed", refreshFromTray).catch(() => {});
listen("session-changed", (event) => {
  if (communicationMode === "group" && activeRoom) return;
  const remotes = Array.isArray(event.payload?.remotes) ? event.payload.remotes : [];
  sessionPeers = new Set(remotes.slice(0, MAX_SESSION_REMOTES));
  localStorage.setItem(SESSION_KEY, JSON.stringify([...sessionPeers]));
  renderSessionMembers();
  renderPeers();
  updateConnectionInsights();
}).catch(() => {});
listen("room-state-changed", () => refreshRooms(communicationMode === "group")).catch(() => {});
listen("favorites-changed", () => { renderFavorites(); updateFavoriteButton(); }).catch(() => {});

loadSessionPeers();
applyLanguageUi(getLanguage(), { broadcast: true });
loadManualIps();
renderFavorites();
loadClientName();
loadDevices();
renderRecentConnections();
loadAutostart();
loadAudioPreferences();
loadNoisePreferences();
initColors();
setCommunicationMode(communicationMode, { initial: true }).catch(error => reportError("Communication mode", error));
loadPeers();
refreshRooms(communicationMode === "group");
setInterval(() => { if (!document.hidden) loadPeers(false); }, 3000);
setInterval(() => { if (!document.hidden || communicationMode === "group") refreshRooms(communicationMode === "group"); }, 2000);
setInterval(() => { if (!document.hidden) updateLatency(); }, 1000);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (micMonitorActive) stopMicMonitor({ announce: false });
    return;
  }
  loadPeers(false);
  refreshRooms(communicationMode === "group");
  updateLatency();
});
updateLatency();
refreshDiagnostics();
checkForUpdates();
setInterval(() => { checkForUpdates(); }, UPDATE_CHECK_INTERVAL_MS);
