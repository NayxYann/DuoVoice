import { invoke } from "@tauri-apps/api/core";
import { enable as enableAutostart, disable as disableAutostart, isEnabled as isAutostartEnabled } from "@tauri-apps/plugin-autostart";
import "./style.css";

const $ = (id) => document.getElementById(id);
let connected = false;

async function loadAutostart() {
  const checkbox = $("autostart");
  const details = $("autostartDetails");
  if (!checkbox || !details) return;
  try {
    checkbox.checked = await isAutostartEnabled();
  } catch (e) {
    details.textContent = `Autostart indisponible : ${e}`;
    checkbox.disabled = true;
  }
}

async function loadDevices() {
  try {
    const devices = await invoke("list_devices");
    $("input").innerHTML = "";
    $("output").innerHTML = "";
    for (const d of devices.inputs) $("input").add(new Option(d, d));
    for (const d of devices.outputs) $("output").add(new Option(d, d));
  } catch (e) {
    $("details").textContent = `Audio indisponible : ${e}`;
  }
}

async function loadPeers() {
  try {
    const peers = await invoke("list_peers");
    const select = $("peer");
    const previous = select.value;
    select.innerHTML = "";
    if (!peers.length) {
      select.add(new Option("Aucun autre PC détecté", ""));
      return;
    }
    for (const p of peers) {
      const opt = new Option(`${p.name} — ${p.address}`, p.address);
      opt.dataset.port = p.port;
      select.add(opt);
    }
    if (previous) select.value = previous;
  } catch (e) {
    $("details").textContent = `Découverte réseau : ${e}`;
  }
}

async function connect() {
  const peer = $("peer").value;
  if (!peer) return;
  try {
    if (!connected) {
      await invoke("start_audio", {
        remote: peer,
        input: $("input").value || null,
        output: $("output").value || null
      });
      connected = true;
      $("connect").textContent = "Se déconnecter";
      $("status").textContent = "Connecté";
      $("status").className = "status online";
      $("details").textContent = "Audio bidirectionnel actif.";
    } else {
      await invoke("stop_audio");
      connected = false;
      $("connect").textContent = "Se connecter";
      $("status").textContent = "Hors ligne";
      $("status").className = "status offline";
      $("details").textContent = "Déconnecté.";
    }
  } catch (e) {
    $("details").textContent = `Erreur audio : ${e}`;
  }
}

$("connect").addEventListener("click", connect);
$("refresh").addEventListener("click", loadPeers);
$("volume").addEventListener("input", async (e) => {
  $("volumeValue").textContent = `${e.target.value}%`;
  if (connected) await invoke("set_volume", { volume: Number(e.target.value) / 100 });
});
$("mute").addEventListener("click", async () => {
  if (!connected) return;
  const muted = await invoke("toggle_mute");
  $("mute").textContent = muted ? "🔇 Unmute" : "🎙️ Mute";
});
$("input").addEventListener("change", async () => {
  if (connected) await invoke("set_input", { name: $("input").value });
});
$("output").addEventListener("change", async () => {
  if (connected) await invoke("set_output", { name: $("output").value });
});

const autostartCheckbox = $("autostart");
if (autostartCheckbox) {
  autostartCheckbox.addEventListener("change", async (e) => {
    try {
      if (e.target.checked) await enableAutostart();
      else await disableAutostart();
      $("autostartDetails").textContent = e.target.checked
        ? "DuoVoice démarrera avec Windows/Linux et restera dans le tray."
        : "Démarrage automatique désactivé.";
    } catch (err) {
      e.target.checked = await isAutostartEnabled().catch(() => false);
      $("autostartDetails").textContent = `Impossible de modifier le démarrage automatique : ${err}`;
    }
  });
}

loadDevices();
loadPeers();
loadAutostart();
setInterval(loadPeers, 2000);
