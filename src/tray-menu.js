import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import "./tray-menu.css";
import { COLOR_KEY, THEME_KEY, applyThemeVariables, normalizeThemeName } from "./theme.js";

const TRAY_SCALE_KEY = "duovoice.trayScale";


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
}

async function openMain(settings) {
  await invoke("show_main_window", { settings }).catch(() => {});
  await getCurrentWindow().hide().catch(() => {});
}

document.getElementById("menuOpen").addEventListener("click", () => openMain(false));
document.getElementById("menuSettings").addEventListener("click", () => openMain(true));
document.getElementById("menuQuit").addEventListener("click", () => invoke("quit_app"));

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") getCurrentWindow().hide().catch(() => {});
});

window.addEventListener("storage", (event) => {
  if (event.key === COLOR_KEY || event.key === THEME_KEY) applyTheme();
  if (event.key === TRAY_SCALE_KEY) applyTrayScale(event.newValue || "1");
});
listen("theme-changed", (event) => applyTheme(event.payload?.theme, event.payload?.color)).catch(() => {});
listen("tray-scale-changed", (event) => applyTrayScale(event.payload?.scale || 1)).catch(() => {});
applyTheme(localStorage.getItem(THEME_KEY) || "duovoice", localStorage.getItem(COLOR_KEY) || "violet");
applyTrayScale(localStorage.getItem(TRAY_SCALE_KEY) || "1");
