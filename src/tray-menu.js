import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import "./tray-menu.css";

const COLOR_KEY = "duovoice.color";
const TRAY_SCALE_KEY = "duovoice.trayScale";
const PALETTE = { violet: "#a78bfa", rose: "#f472b6", bleu: "#60a5fa", vert: "#4ade80", jaune: "#facc15", orange: "#fb923c", cyan: "#22d3ee", ardoise: "#94a3b8" };


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

function applyColor(name) {
  const color = PALETTE[name] || PALETTE.violet;
  document.documentElement.style.setProperty("--accent", color);
  document.documentElement.style.setProperty("--accent-soft", `${color}20`);
  document.documentElement.style.setProperty("--accent-border", `${color}66`);
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
  if (event.key === COLOR_KEY) applyColor(event.newValue || "violet");
  if (event.key === TRAY_SCALE_KEY) applyTrayScale(event.newValue || "1");
});
listen("theme-changed", (event) => applyColor(event.payload?.color || "violet")).catch(() => {});
listen("tray-scale-changed", (event) => applyTrayScale(event.payload?.scale || 1)).catch(() => {});
applyColor(localStorage.getItem(COLOR_KEY) || "violet");
applyTrayScale(localStorage.getItem(TRAY_SCALE_KEY) || "1");
