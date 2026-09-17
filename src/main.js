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
  }
}

async function loadDevices() {
  try {
    const devices = await invoke("list_devices");
    $("input").innerHTML = "";
    $("output").innerHTML = "";
    for (const d of devices.inputs) $("input").add(new Option(d, d));
    for (const d of devices.outputs) $("output").add(new Option(d, d));
    const savedInput = localStorage.getItem("duovoice.input");
    const savedOutput = localStorage.getItem("duovoice.output");
    if (savedInput && [...$("input").options].some(o=>o.value===savedInput)) $("input").value=savedInput;
    if (savedOutput && [...$("output").options].some(o=>o.value===savedOutput)) $("output").value=savedOutput;
  } catch (e) {
    $("details").textContent = `Audio indisponible : ${e}`;
  }
}

const peerCache = new Map();
async function loadPeers(manual=false) {
  const refresh = $("refresh");
  try {
    if (manual) { refresh.classList.add("refreshing"); refresh.textContent = "…"; $("details").textContent = "Recherche des ordinateurs sur le réseau…"; }
    const peers = await invoke("list_peers");
    const now = Date.now();
    for (const p of peers) peerCache.set(p.address, {...p, seenAt: now});
    for (const [address, p] of peerCache) if (now - p.seenAt > 8000) peerCache.delete(address);
    const select = $("peer"); const previous = select.value; select.innerHTML = "";
    const list = [...peerCache.values()].sort((a,b)=>a.name.localeCompare(b.name));
    if (!list.length) select.add(new Option("Aucun autre PC détecté", ""));
    for (const p of list) { const opt=new Option(`${p.name} — ${p.address}`,p.address); opt.dataset.port=p.port; select.add(opt); }
    if (previous && [...select.options].some(o=>o.value===previous)) select.value=previous;
    if (manual) $("details").textContent = list.length ? `${list.length} ordinateur(s) détecté(s).` : "Aucun autre PC détecté.";
  } catch(e) { $("details").textContent=`Découverte réseau : ${e}`; }
  finally { if(manual){refresh.classList.remove("refreshing"); refresh.textContent="↻";} }
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
$("refresh").addEventListener("click", () => loadPeers(true));
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
  localStorage.setItem("duovoice.input", $("input").value);
  if (connected) $("details").textContent = "Le nouveau micro sera utilisé à la prochaine connexion.";
});
$("output").addEventListener("change", async () => {
  localStorage.setItem("duovoice.output", $("output").value);
  if (connected) $("details").textContent = "La nouvelle sortie sera utilisée à la prochaine connexion.";
});

const autostart = $("autostart");
if (autostart) {
  autostart.addEventListener("change", async (e) => {
    const details = $("autostartDetails");
    try {
      if (e.target.checked) await enableAutostart();
      else await disableAutostart();
      if (details) details.textContent = e.target.checked
        ? "DuoVoice démarrera avec Windows/Linux et restera dans le tray."
        : "Démarrage automatique désactivé.";
    } catch (err) {
      e.target.checked = await isAutostartEnabled().catch(() => false);
      if (details) details.textContent = `Impossible de modifier le démarrage automatique : ${err}`;
    }
  });
}

loadDevices();
loadAutostart();


const startHidden = $("startHidden");
const closeAction = $("closeAction");
startHidden.checked = localStorage.getItem("duovoice.startHidden") !== "false";
closeAction.value = localStorage.getItem("duovoice.closeAction") || "tray";
startHidden.addEventListener("change", ()=>localStorage.setItem("duovoice.startHidden", String(startHidden.checked)));
closeAction.addEventListener("change", async ()=>{ localStorage.setItem("duovoice.closeAction", closeAction.value); try { await invoke("set_close_action", { action: closeAction.value }); } catch(e) { $("details").textContent=`Réglage fermeture : ${e}`; } });
loadPeers();
setInterval(()=>loadPeers(false), 3000);
