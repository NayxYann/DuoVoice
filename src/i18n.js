export const LANGUAGE_KEY = "duovoice.language";
export const DEFAULT_LANGUAGE = "en";
export const SUPPORTED_LANGUAGES = ["en", "fr", "es", "de"];

const STRINGS = {
  "Intercom local": { en: "Local intercom", es: "Intercomunicador local", de: "Lokale Gegensprechanlage" },

  "Ouvrir": { en: "Open", es: "Abrir", de: "Öffnen" },
  "Ouvrir DuoVoice sur GitHub": { en: "Open DuoVoice on GitHub", es: "Abrir DuoVoice en GitHub", de: "DuoVoice auf GitHub öffnen" },
  "Choisir un hôte": { en: "Choose a host", es: "Elegir un host", de: "Host auswählen" },
  "Réactiver": { en: "Unmute", es: "Reactivar", de: "Ton an" },
  "Hors ligne": { en: "Offline", es: "Sin conexión", de: "Offline" },
  "Connecté": { en: "Connected", es: "Conectado", de: "Verbunden" },
  "Paramètres": { en: "Settings", es: "Ajustes", de: "Einstellungen" },
  "Quitter DuoVoice": { en: "Quit DuoVoice", es: "Salir de DuoVoice", de: "DuoVoice beenden" },
  "Quitter": { en: "Quit", es: "Salir", de: "Beenden" },
  "Annuler": { en: "Cancel", es: "Cancelar", de: "Abbrechen" },
  "Fermer": { en: "Close", es: "Cerrar", de: "Schließen" },
  "Retour": { en: "Back", es: "Volver", de: "Zurück" },
  "Vérification des mises à jour…": { en: "Checking for updates…", es: "Buscando actualizaciones…", de: "Nach Updates wird gesucht…" },
  "Recherche des mises à jour…": { en: "Checking for updates…", es: "Buscando actualizaciones…", de: "Nach Updates wird gesucht…" },
  "Pas de mise à jour disponible · Cliquez pour vérifier": { en: "No update available · Click to check", es: "No hay actualizaciones · Haz clic para comprobar", de: "Kein Update verfügbar · Zum Prüfen klicken" },
  "Vérification impossible · Cliquez pour réessayer": { en: "Unable to check · Click to retry", es: "No se pudo comprobar · Haz clic para reintentar", de: "Prüfung nicht möglich · Zum Wiederholen klicken" },
  "Connexion": { en: "Connection", es: "Conexión", de: "Verbindung" },
  "Choisissez le PC avec lequel communiquer.": { en: "Choose the PC you want to communicate with.", es: "Elige el PC con el que quieres comunicarte.", de: "Wähle den PC aus, mit dem du kommunizieren möchtest." },
  "Actualiser la détection": { en: "Refresh discovery", es: "Actualizar detección", de: "Erkennung aktualisieren" },
  "Nom de cette machine": { en: "This machine name", es: "Nombre de este equipo", de: "Name dieses Computers" },
  "Nom visible sur le réseau": { en: "Name visible on the network", es: "Nombre visible en la red", de: "Im Netzwerk sichtbarer Name" },
  "Enregistrer le nom": { en: "Save name", es: "Guardar nombre", de: "Name speichern" },
  "Valider ce nouveau nom": { en: "Apply this new name", es: "Aplicar este nuevo nombre", de: "Diesen neuen Namen übernehmen" },
  "Nom déjà appliqué": { en: "Name already applied", es: "Nombre ya aplicado", de: "Name bereits übernommen" },
  "Ordinateur distant": { en: "Remote computer", es: "Equipo remoto", de: "Entfernter Computer" },
  "Recherche d'un PC…": { en: "Searching for a PC…", es: "Buscando un PC…", de: "PC wird gesucht…" },
  "Recherche d’un PC…": { en: "Searching for a PC…", es: "Buscando un PC…", de: "PC wird gesucht…" },
  "Aucun PC détecté — ajoutez une IP": { en: "No PC detected — add an IP", es: "No se detectó ningún PC — añade una IP", de: "Kein PC erkannt — IP hinzufügen" },
  "Ajouter aux favoris": { en: "Add to favorites", es: "Añadir a favoritos", de: "Zu Favoriten hinzufügen" },
  "Retirer des favoris": { en: "Remove from favorites", es: "Quitar de favoritos", de: "Aus Favoriten entfernen" },
  "Favoris": { en: "Favorites", es: "Favoritos", de: "Favoriten" },
  "Actions rapides": { en: "Quick actions", es: "Acciones rápidas", de: "Schnellaktionen" },
  "Disponible": { en: "Available", es: "Disponible", de: "Verfügbar" },
  "Indisponible": { en: "Unavailable", es: "No disponible", de: "Nicht verfügbar" },
  "Déjà connecté": { en: "Already connected", es: "Ya conectado", de: "Bereits verbunden" },
  "Se connecter": { en: "Connect", es: "Conectar", de: "Verbinden" },
  "Se déconnecter": { en: "Disconnect", es: "Desconectar", de: "Trennen" },
  "Adresse IP, ex. 192.168.1.25": { en: "IP address, e.g. 192.168.1.25", es: "Dirección IP, p. ej. 192.168.1.25", de: "IP-Adresse, z. B. 192.168.1.25" },
  "Ajouter cette IP": { en: "Add this IP", es: "Añadir esta IP", de: "Diese IP hinzufügen" },
  "Vous pouvez aussi ajouter directement une adresse IP.": { en: "You can also add an IP address directly.", es: "También puedes añadir directamente una dirección IP.", de: "Du kannst auch direkt eine IP-Adresse hinzufügen." },
  "Audio": { en: "Audio", es: "Audio", de: "Audio" },
  "Microphone et sortie du PC.": { en: "Microphone and PC output.", es: "Micrófono y salida del PC.", de: "Mikrofon und PC-Ausgabe." },
  "Microphone": { en: "Microphone", es: "Micrófono", de: "Mikrofon" },
  "Sortie audio": { en: "Audio output", es: "Salida de audio", de: "Audioausgabe" },
  "Réduction de bruit": { en: "Noise reduction", es: "Reducción de ruido", de: "Rauschunterdrückung" },
  "Désactivée": { en: "Disabled", es: "Desactivada", de: "Deaktiviert" },
  "Réglages de la réduction de bruit": { en: "Noise reduction settings", es: "Ajustes de reducción de ruido", de: "Rauschunterdrückung einstellen" },
  "Activer la réduction de bruit": { en: "Enable noise reduction", es: "Activar reducción de ruido", de: "Rauschunterdrückung aktivieren" },
  "Réglages": { en: "Settings", es: "Ajustes", de: "Einstellungen" },
  "RNNoise · traitement local": { en: "RNNoise · local processing", es: "RNNoise · procesamiento local", de: "RNNoise · lokale Verarbeitung" },
  "Intensité": { en: "Intensity", es: "Intensidad", de: "Intensität" },
  "Plus fort = suppression plus marquée": { en: "Higher = stronger suppression", es: "Más alto = mayor supresión", de: "Höher = stärkere Unterdrückung" },
  "Naturel": { en: "Natural", es: "Natural", de: "Natürlich" },
  "Équilibré": { en: "Balanced", es: "Equilibrado", de: "Ausgewogen" },
  "Agressif": { en: "Aggressive", es: "Agresivo", de: "Aggressiv" },
  "La réduction est appliquée au micro avant l'envoi réseau. Le curseur dose le mélange entre le signal brut et le signal traité.": { en: "Noise reduction is applied to the microphone before network transmission. The slider controls the mix between the raw and processed signal.", es: "La reducción de ruido se aplica al micrófono antes del envío por red. El control ajusta la mezcla entre la señal original y la procesada.", de: "Die Rauschunterdrückung wird vor der Netzwerkübertragung auf das Mikrofon angewendet. Der Regler bestimmt die Mischung aus Roh- und verarbeitetem Signal." },
  "Volume distant": { en: "Remote volume", es: "Volumen remoto", de: "Remote-Lautstärke" },
  "Autoriser le volume au-dessus de 100%": { en: "Allow volume above 100%", es: "Permitir volumen por encima del 100%", de: "Lautstärke über 100% erlauben" },
  "Muet": { en: "Mute", es: "Silenciar", de: "Stumm" },
  "Réactiver le son": { en: "Unmute", es: "Reactivar sonido", de: "Ton an" },
  "État": { en: "Status", es: "Estado", de: "Status" },
  "Recherche des ordinateurs sur le réseau local…": { en: "Searching for computers on the local network…", es: "Buscando equipos en la red local…", de: "Computer im lokalen Netzwerk werden gesucht…" },
  "Latence audio": { en: "Audio latency", es: "Latencia de audio", de: "Audio-Latenz" },
  "Mode": { en: "Mode", es: "Modo", de: "Modus" },
  "LAN direct": { en: "Direct LAN", es: "LAN directo", de: "Direktes LAN" },
  "Préférences de DuoVoice": { en: "DuoVoice preferences", es: "Preferencias de DuoVoice", de: "DuoVoice-Einstellungen" },
  "Version": { en: "Version", es: "Versión", de: "Version" },
  "Version actuellement installée et mises à jour.": { en: "Currently installed version and updates.", es: "Versión instalada y actualizaciones.", de: "Installierte Version und Updates." },
  "Version installée": { en: "Installed version", es: "Versión instalada", de: "Installierte Version" },
  "Cliquez sur la version pour choisir une autre release.": { en: "Click the version to choose another release.", es: "Haz clic en la versión para elegir otra versión.", de: "Auf die Version klicken, um eine andere Release zu wählen." },
  "Cliquer sur la version pour choisir une autre release.": { en: "Click the version to choose another release.", es: "Haz clic en la versión para elegir otra versión.", de: "Auf die Version klicken, um eine andere Release zu wählen." },
  "Choisir une autre version": { en: "Choose another version", es: "Elegir otra versión", de: "Andere Version auswählen" },
  "Historique": { en: "History", es: "Historial", de: "Verlauf" },
  "Dernière mise à jour : non disponible": { en: "Last update: unavailable", es: "Última actualización: no disponible", de: "Letztes Update: nicht verfügbar" },
  "Langue": { en: "Language", es: "Idioma", de: "Sprache" },
  "Choisissez la langue de l'application.": { en: "Choose the application language.", es: "Elige el idioma de la aplicación.", de: "Wähle die Sprache der Anwendung." },
  "Langue de l'interface": { en: "Interface language", es: "Idioma de la interfaz", de: "Sprache der Oberfläche" },
  "Démarrage": { en: "Startup", es: "Inicio", de: "Start" },
  "Contrôlez le comportement au lancement.": { en: "Control startup behavior.", es: "Controla el comportamiento al iniciar.", de: "Startverhalten steuern." },
  "Démarrer DuoVoice avec Windows": { en: "Start DuoVoice with Windows", es: "Iniciar DuoVoice con Windows", de: "DuoVoice mit Windows starten" },
  "Afficher l’icône dans le systray": { en: "Show the system tray icon", es: "Mostrar el icono en la bandeja del sistema", de: "Symbol im Infobereich anzeigen" },
  "Démarrer minimisé dans le tray": { en: "Start minimized to tray", es: "Iniciar minimizado en la bandeja", de: "Minimiert im Infobereich starten" },
  "Les réglages sont enregistrés automatiquement.": { en: "Settings are saved automatically.", es: "Los ajustes se guardan automáticamente.", de: "Einstellungen werden automatisch gespeichert." },
  "Fermeture": { en: "Close behavior", es: "Comportamiento al cerrar", de: "Schließen" },
  "Choisissez ce que fait le bouton X.": { en: "Choose what the X button does.", es: "Elige qué hace el botón X.", de: "Wähle die Aktion der X-Schaltfläche." },
  "Action du bouton fermer": { en: "Close button action", es: "Acción del botón cerrar", de: "Aktion der Schließen-Schaltfläche" },
  "Réduire dans le tray": { en: "Minimize to tray", es: "Minimizar a la bandeja", de: "In den Infobereich minimieren" },
  "En mode tray, DuoVoice disparaît aussi de la barre des tâches.": { en: "In tray mode, DuoVoice also disappears from the taskbar.", es: "En modo bandeja, DuoVoice también desaparece de la barra de tareas.", de: "Im Infobereich-Modus verschwindet DuoVoice auch aus der Taskleiste." },
  "Apparence": { en: "Appearance", es: "Apariencia", de: "Darstellung" },
  "Choisissez une couleur douce pour l’interface.": { en: "Choose a soft accent color for the interface.", es: "Elige un color de acento suave para la interfaz.", de: "Wähle eine dezente Akzentfarbe für die Oberfläche." },
  "Couleur de l'application": { en: "Application color", es: "Color de la aplicación", de: "Anwendungsfarbe" },
  "Thèmes++": { en: "Themes++", es: "Temas++", de: "Themes++" },
  "Applique une palette complète à DuoVoice et au systray.": { en: "Applies a complete palette to DuoVoice and the system tray.", es: "Aplica una paleta completa a DuoVoice y a la bandeja del sistema.", de: "Wendet eine vollständige Palette auf DuoVoice und den Infobereich an." },
  "Thèmes complets de l'application": { en: "Complete application themes", es: "Temas completos de la aplicación", de: "Vollständige Anwendungsthemen" },
  "Échelle de l’interface": { en: "Interface scale", es: "Escala de la interfaz", de: "Oberflächenskalierung" },
  "Ajustez la taille générale de DuoVoice selon votre écran et votre confort.": { en: "Adjust DuoVoice size for your display and comfort.", es: "Ajusta el tamaño de DuoVoice a tu pantalla y comodidad.", de: "Passe die Größe von DuoVoice an deinen Bildschirm und Komfort an." },
  "Application principale": { en: "Main application", es: "Aplicación principal", de: "Hauptanwendung" },
  "Contrôle rapide du systray": { en: "System tray controls", es: "Controles rápidos de la bandeja", de: "Infobereich-Steuerung" },
  "Actions des échelles de l'interface": { en: "Interface scale actions", es: "Acciones de escala de la interfaz", de: "Aktionen für die Oberflächenskalierung" },
  "Rétablir par défaut": { en: "Restore defaults", es: "Restaurar valores", de: "Standard wiederherstellen" },
  "Appliquer les modifications": { en: "Apply changes", es: "Aplicar cambios", de: "Änderungen anwenden" },
  "Les périphériques, le volume et la réduction de bruit sont conservés entre les lancements.": { en: "Devices, volume and noise reduction are kept between launches.", es: "Los dispositivos, el volumen y la reducción de ruido se conservan entre inicios.", de: "Geräte, Lautstärke und Rauschunterdrückung bleiben zwischen Starts gespeichert." },
  "Volume enregistré": { en: "Saved volume", es: "Volumen guardado", de: "Gespeicherte Lautstärke" },
  "Choisir une version": { en: "Choose a version", es: "Elegir una versión", de: "Version auswählen" },
  "Installez la version signée de DuoVoice de votre choix, plus ancienne ou plus récente.": { en: "Install any available signed DuoVoice release, older or newer.", es: "Instala cualquier versión firmada disponible de DuoVoice, anterior o posterior.", de: "Installiere eine beliebige verfügbare signierte DuoVoice-Version, älter oder neuer." },
  "Recherche des versions disponibles…": { en: "Searching available versions…", es: "Buscando versiones disponibles…", de: "Verfügbare Versionen werden gesucht…" },
  "Aucune autre version installable n’a été trouvée.": { en: "No other installable version was found.", es: "No se encontró otra versión instalable.", de: "Keine andere installierbare Version gefunden." },
  "Impossible de récupérer l’historique des versions.": { en: "Unable to retrieve version history.", es: "No se pudo recuperar el historial de versiones.", de: "Versionsverlauf konnte nicht geladen werden." },
  "Installer": { en: "Install", es: "Instalar", de: "Installieren" },
  "cette version": { en: "this version", es: "esta versión", de: "diese Version" },
  "Quitter DuoVoice ?": { en: "Quit DuoVoice?", es: "¿Salir de DuoVoice?", de: "DuoVoice beenden?" },
  "L’application et l’audio seront complètement arrêtés.": { en: "The application and audio will be completely stopped.", es: "La aplicación y el audio se detendrán por completo.", de: "Anwendung und Audio werden vollständig beendet." },
  "Hôte": { en: "Host", es: "Host", de: "Host" },
  "Aucun hôte connecté": { en: "No host connected", es: "Ningún host conectado", de: "Kein Host verbunden" },
  "Choisir un PC…": { en: "Choose a PC…", es: "Elegir un PC…", de: "PC auswählen…" },
  "Aucun hôte détecté": { en: "No host detected", es: "Ningún host detectado", de: "Kein Host erkannt" },
  "Connexion rapide": { en: "Quick connection", es: "Conexión rápida", de: "Schnellverbindung" },
  "Connexion": { en: "Connection", es: "Conexión", de: "Verbindung" },
  "Contrôles rapides": { en: "Quick controls", es: "Controles rápidos", de: "Schnellsteuerung" },
  "Ouvrir DuoVoice": { en: "Open DuoVoice", es: "Abrir DuoVoice", de: "DuoVoice öffnen" },
  "Page GitHub": { en: "GitHub page", es: "Página de GitHub", de: "GitHub-Seite" },
  "Erreur de connexion": { en: "Connection error", es: "Error de conexión", de: "Verbindungsfehler" },
  "Déconnecter": { en: "Disconnect", es: "Desconectar", de: "Trennen" },
  "Hôte connecté": { en: "Connected host", es: "Host conectado", de: "Verbundener Host" },
  "Aucun favori. Sélectionnez un PC puis utilisez le bouton Favori.": { en: "No favorites yet. Select a PC, then use the Favorite button.", es: "Aún no hay favoritos. Selecciona un PC y usa el botón Favorito.", de: "Noch keine Favoriten. Wähle einen PC und nutze dann die Favoriten-Schaltfläche." },
  "Aucun PC détecté. Vous pouvez ajouter une IP manuellement.": { en: "No PC detected. You can add an IP address manually.", es: "No se detectó ningún PC. Puedes añadir una IP manualmente.", de: "Kein PC erkannt. Du kannst eine IP-Adresse manuell hinzufügen." },
  "Audio arrêté.": { en: "Audio stopped.", es: "Audio detenido.", de: "Audio gestoppt." },
  "Audio bidirectionnel actif.": { en: "Bidirectional audio active.", es: "Audio bidireccional activo.", de: "Bidirektionales Audio aktiv." },
  "Cliquer pour lancer une nouvelle vérification.": { en: "Click to run another check.", es: "Haz clic para volver a comprobar.", de: "Klicken, um erneut zu prüfen." },
  "Déconnecté.": { en: "Disconnected.", es: "Desconectado.", de: "Getrennt." },
  "Démarrage automatique activé.": { en: "Automatic startup enabled.", es: "Inicio automático activado.", de: "Automatischer Start aktiviert." },
  "Démarrage automatique désactivé.": { en: "Automatic startup disabled.", es: "Inicio automático desactivado.", de: "Automatischer Start deaktiviert." },
  "Favori retiré.": { en: "Favorite removed.", es: "Favorito eliminado.", de: "Favorit entfernt." },
  "Icône du systray activée.": { en: "System tray icon enabled.", es: "Icono de la bandeja activado.", de: "Infobereich-Symbol aktiviert." },
  "Icône du systray désactivée. Le démarrage minimisé est désactivé pour garder DuoVoice accessible.": { en: "System tray icon disabled. Start minimized was disabled to keep DuoVoice accessible.", es: "Icono de la bandeja desactivado. Se desactivó el inicio minimizado para mantener DuoVoice accesible.", de: "Infobereich-Symbol deaktiviert. Der minimierte Start wurde deaktiviert, damit DuoVoice erreichbar bleibt." },
  "Les deux échelles sont déjà à 100%": { en: "Both scales are already at 100%", es: "Ambas escalas ya están al 100%", de: "Beide Skalierungen sind bereits bei 100%" },
  "Mise à jour installée. Redémarrage de DuoVoice…": { en: "Update installed. Restarting DuoVoice…", es: "Actualización instalada. Reiniciando DuoVoice…", de: "Update installiert. DuoVoice wird neu gestartet…" },
  "Recherche des ordinateurs…": { en: "Searching for computers…", es: "Buscando equipos…", de: "Computer werden gesucht…" },
  "Sélectionnez un ordinateur ou ajoutez une IP.": { en: "Select a computer or add an IP address.", es: "Selecciona un equipo o añade una IP.", de: "Wähle einen Computer oder füge eine IP-Adresse hinzu." },
  "Téléchargement de la mise à jour…": { en: "Downloading the update…", es: "Descargando la actualización…", de: "Update wird heruntergeladen…" },
  "Téléchargement de la mise à jour… 0%": { en: "Downloading the update… 0%", es: "Descargando la actualización… 0%", de: "Update wird heruntergeladen… 0%" },
  "Téléchargement terminé. Installation de la mise à jour…": { en: "Download complete. Installing the update…", es: "Descarga completada. Instalando la actualización…", de: "Download abgeschlossen. Update wird installiert…" },
  "Téléchargement terminé. Vérification de la mise à jour…": { en: "Download complete. Verifying the update…", es: "Descarga completada. Verificando la actualización…", de: "Download abgeschlossen. Update wird überprüft…" },
  "Vérification impossible": { en: "Unable to check", es: "No se pudo comprobar", de: "Prüfung nicht möglich" },
  "Date de mise à jour : non disponible": { en: "Update date: unavailable", es: "Fecha de actualización: no disponible", de: "Update-Datum: nicht verfügbar" },
  "Application…": { en: "Applying…", es: "Aplicando…", de: "Wird angewendet…" },
  "✓ Paramètres appliqués": { en: "✓ Settings applied", es: "✓ Ajustes aplicados", de: "✓ Einstellungen übernommen" },
  "Sombre neutre avec votre couleur d’accent.": { en: "Neutral dark theme with your accent color.", es: "Tema oscuro neutro con tu color de acento.", de: "Neutrales dunkles Design mit deiner Akzentfarbe." },
  "Bleu classique, surfaces crème et accent vert.": { en: "Classic blue, cream surfaces and green accent.", es: "Azul clásico, superficies crema y acento verde.", de: "Klassisches Blau, cremefarbene Flächen und grüner Akzent." },
  "Rose mauve doux sur fond sombre chaleureux.": { en: "Soft mauve pink on a warm dark background.", es: "Rosa malva suave sobre un fondo oscuro cálido.", de: "Sanftes Mauverosa auf warmem dunklem Hintergrund." },
  "Rose très clair, blanc cassé et cerisier doux.": { en: "Very light pink, off-white and soft cherry tones.", es: "Rosa muy claro, blanco roto y tonos cereza suaves.", de: "Sehr helles Rosa, gebrochenes Weiß und sanfte Kirschfarben." },
  "Vert pâle, sobre et légèrement désaturé.": { en: "Pale, understated and slightly desaturated green.", es: "Verde pálido, sobrio y ligeramente desaturado.", de: "Blasses, dezentes und leicht entsättigtes Grün." },
  "Bleu profond et cyan calme.": { en: "Deep blue and calm cyan.", es: "Azul profundo y cian suave.", de: "Tiefes Blau und ruhiges Cyan." }
};

function normalizeLanguage(value) {
  return SUPPORTED_LANGUAGES.includes(value) ? value : DEFAULT_LANGUAGE;
}

export function getLanguage() {
  return normalizeLanguage(localStorage.getItem(LANGUAGE_KEY) || DEFAULT_LANGUAGE);
}

const textSources = new WeakMap();
const textRendered = new WeakMap();
const attrSources = new WeakMap();
const attrRendered = new WeakMap();
let observer = null;

function coreTranslate(source, language) {
  if (!source || language === "fr") return source;
  const exact = STRINGS[source]?.[language];
  if (exact) return exact;

  let m;
  if ((m = source.match(/^Activée · (\d+)%$/))) return ({ en: `Enabled · ${m[1]}%`, es: `Activada · ${m[1]}%`, de: `Aktiviert · ${m[1]}%` })[language];
  if ((m = source.match(/^Mise à jour disponible · v(.+) · Cliquez pour télécharger$/))) return ({ en: `Update available · v${m[1]} · Click to download`, es: `Actualización disponible · v${m[1]} · Haz clic para descargar`, de: `Update verfügbar · v${m[1]} · Zum Herunterladen klicken` })[language];
  if ((m = source.match(/^Télécharger et installer DuoVoice v(.+)$/))) return ({ en: `Download and install DuoVoice v${m[1]}`, es: `Descargar e instalar DuoVoice v${m[1]}`, de: `DuoVoice v${m[1]} herunterladen und installieren` })[language];
  if ((m = source.match(/^Préparation de v(.+)…$/))) return ({ en: `Preparing v${m[1]}…`, es: `Preparando v${m[1]}…`, de: `v${m[1]} wird vorbereitet…` })[language];
  if ((m = source.match(/^Téléchargement de v(.+)…$/))) return ({ en: `Downloading v${m[1]}…`, es: `Descargando v${m[1]}…`, de: `v${m[1]} wird heruntergeladen…` })[language];
  if ((m = source.match(/^Téléchargement de v(.+) · (\d+)%$/))) return ({ en: `Downloading v${m[1]} · ${m[2]}%`, es: `Descargando v${m[1]} · ${m[2]}%`, de: `v${m[1]} wird heruntergeladen · ${m[2]}%` })[language];
  if ((m = source.match(/^Installation de v(.+)…$/))) return ({ en: `Installing v${m[1]}…`, es: `Instalando v${m[1]}…`, de: `v${m[1]} wird installiert…` })[language];
  if ((m = source.match(/^(\d+) ordinateur\(s\) disponible\(s\)\.$/))) return ({ en: `${m[1]} computer(s) available.`, es: `${m[1]} equipo(s) disponible(s).`, de: `${m[1]} Computer verfügbar.` })[language];
  if ((m = source.match(/^IP (.+) ajoutée\.$/))) return ({ en: `IP ${m[1]} added.`, es: `IP ${m[1]} añadida.`, de: `IP ${m[1]} hinzugefügt.` })[language];
  if ((m = source.match(/^Connexion à (.+)…$/))) return ({ en: `Connecting to ${m[1]}…`, es: `Conectando con ${m[1]}…`, de: `Verbindung zu ${m[1]} wird hergestellt…` })[language];
  if ((m = source.match(/^Mise à jour v(.+) disponible\.$/))) return ({ en: `Update v${m[1]} available.`, es: `Actualización v${m[1]} disponible.`, de: `Update v${m[1]} verfügbar.` })[language];
  if ((m = source.match(/^Installer (.+) \?$/))) return ({ en: `Install ${m[1]}?`, es: `¿Instalar ${m[1]}?`, de: `${m[1]} installieren?` })[language];
  if ((m = source.match(/^(.+) ajouté aux favoris\.$/))) return ({ en: `${m[1]} added to favorites.`, es: `${m[1]} añadido a favoritos.`, de: `${m[1]} zu Favoriten hinzugefügt.` })[language];
  if ((m = source.match(/^Audio indisponible : (.+)$/))) return ({ en: `Audio unavailable: ${m[1]}`, es: `Audio no disponible: ${m[1]}`, de: `Audio nicht verfügbar: ${m[1]}` })[language];
  if ((m = source.match(/^Connexion impossible : (.+)$/))) return ({ en: `Connection failed: ${m[1]}`, es: `Conexión fallida: ${m[1]}`, de: `Verbindung fehlgeschlagen: ${m[1]}` })[language];
  if ((m = source.match(/^Déconnexion : (.+)$/))) return ({ en: `Disconnect error: ${m[1]}`, es: `Error al desconectar: ${m[1]}`, de: `Fehler beim Trennen: ${m[1]}` })[language];
  if ((m = source.match(/^Détection réseau : (.+)$/))) return ({ en: `Network discovery: ${m[1]}`, es: `Detección de red: ${m[1]}`, de: `Netzwerkerkennung: ${m[1]}` })[language];
  if ((m = source.match(/^IP invalide : (.+)$/))) return ({ en: `Invalid IP: ${m[1]}`, es: `IP no válida: ${m[1]}`, de: `Ungültige IP: ${m[1]}` })[language];
  if ((m = source.match(/^Nom de la machine : (.+)$/))) return ({ en: `Machine name: ${m[1]}`, es: `Nombre del equipo: ${m[1]}`, de: `Computername: ${m[1]}` })[language];
  if ((m = source.match(/^Réduction de bruit : (.+)$/))) return ({ en: `Noise reduction: ${m[1]}`, es: `Reducción de ruido: ${m[1]}`, de: `Rauschunterdrückung: ${m[1]}` })[language];
  if ((m = source.match(/^Volume : (.+)$/))) return ({ en: `Volume: ${m[1]}`, es: `Volumen: ${m[1]}`, de: `Lautstärke: ${m[1]}` })[language];
  if ((m = source.match(/^Muet : (.+)$/))) return ({ en: `Mute: ${m[1]}`, es: `Silencio: ${m[1]}`, de: `Stumm: ${m[1]}` })[language];
  if ((m = source.match(/^Réglage fermeture : (.+)$/))) return ({ en: `Close behavior: ${m[1]}`, es: `Comportamiento al cerrar: ${m[1]}`, de: `Schließverhalten: ${m[1]}` })[language];
  if ((m = source.match(/^Initialisation de la fenêtre impossible : (.+)$/))) return ({ en: `Unable to initialize the window: ${m[1]}`, es: `No se pudo inicializar la ventana: ${m[1]}`, de: `Fenster konnte nicht initialisiert werden: ${m[1]}` })[language];
  if ((m = source.match(/^Vérification des mises à jour impossible : (.+)$/))) return ({ en: `Unable to check for updates: ${m[1]}`, es: `No se pudieron buscar actualizaciones: ${m[1]}`, de: `Update-Prüfung nicht möglich: ${m[1]}` })[language];
  if ((m = source.match(/^Mise à jour impossible : (.+)$/))) return ({ en: `Update failed: ${m[1]}`, es: `Actualización fallida: ${m[1]}`, de: `Update fehlgeschlagen: ${m[1]}` })[language];
  if ((m = source.match(/^Installation impossible : (.+)$/))) return ({ en: `Installation failed: ${m[1]}`, es: `Instalación fallida: ${m[1]}`, de: `Installation fehlgeschlagen: ${m[1]}` })[language];
  if ((m = source.match(/^Téléchargement de la mise à jour… (\d+)%$/))) return ({ en: `Downloading the update… ${m[1]}%`, es: `Descargando la actualización… ${m[1]}%`, de: `Update wird heruntergeladen… ${m[1]}%` })[language];
  if ((m = source.match(/^Vérification terminée à (.+) : aucune mise à jour disponible\.$/))) return ({ en: `Check completed at ${m[1]}: no update available.`, es: `Comprobación finalizada a las ${m[1]}: no hay actualizaciones.`, de: `Prüfung um ${m[1]} abgeschlossen: kein Update verfügbar.` })[language];
  if ((m = source.match(/^✓ Nom réseau appliqué : (.+)\. Les autres PC le verront automatiquement\.$/))) return ({ en: `✓ Network name applied: ${m[1]}. Other PCs will see it automatically.`, es: `✓ Nombre de red aplicado: ${m[1]}. Los demás PC lo verán automáticamente.`, de: `✓ Netzwerkname übernommen: ${m[1]}. Andere PCs sehen ihn automatisch.` })[language];
  if ((m = source.match(/^✓ Échelles de l’application et du systray rétablies à 100%\.$/))) return ({ en: `✓ Application and tray scales restored to 100%.`, es: `✓ Escalas de la aplicación y de la bandeja restauradas al 100%.`, de: `✓ Anwendungs- und Tray-Skalierung auf 100% zurückgesetzt.` })[language];
  if ((m = source.match(/^✓ Échelles appliquées — application : (.+), systray : (.+)\.$/))) return ({ en: `✓ Scales applied — application: ${m[1]}, tray: ${m[2]}.`, es: `✓ Escalas aplicadas — aplicación: ${m[1]}, bandeja: ${m[2]}.`, de: `✓ Skalierungen angewendet — Anwendung: ${m[1]}, Tray: ${m[2]}.` })[language];
  if ((m = source.match(/^Dernière mise à jour : (.+)$/))) return ({ en: `Last update: ${m[1]}`, es: `Última actualización: ${m[1]}`, de: `Letztes Update: ${m[1]}` })[language];

  return source;
}

function translateTextNode(node, language, forceSource = false) {
  const raw = node.nodeValue ?? "";
  if (!raw.trim()) return;
  const last = textRendered.get(node);
  if (forceSource || !textSources.has(node) || (last !== undefined && raw !== last)) textSources.set(node, raw);
  const sourceRaw = textSources.get(node) ?? raw;
  const match = sourceRaw.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const leading = match?.[1] ?? "";
  const core = match?.[2] ?? sourceRaw;
  const trailing = match?.[3] ?? "";
  const rendered = `${leading}${coreTranslate(core, language)}${trailing}`;
  textRendered.set(node, rendered);
  if (node.nodeValue !== rendered) node.nodeValue = rendered;
}

const TRANSLATED_ATTRS = ["placeholder", "title", "aria-label"];
function translateElementAttrs(element, language) {
  let sourceMap = attrSources.get(element);
  if (!sourceMap) { sourceMap = {}; attrSources.set(element, sourceMap); }
  let renderedMap = attrRendered.get(element);
  if (!renderedMap) { renderedMap = {}; attrRendered.set(element, renderedMap); }
  for (const attr of TRANSLATED_ATTRS) {
    if (!element.hasAttribute?.(attr)) continue;
    const current = element.getAttribute(attr) || "";
    if (!(attr in sourceMap) || (renderedMap[attr] !== undefined && current !== renderedMap[attr])) sourceMap[attr] = current;
    const rendered = coreTranslate(sourceMap[attr], language);
    renderedMap[attr] = rendered;
    if (current !== rendered) element.setAttribute(attr, rendered);
  }
}

function translateSubtree(root, language = getLanguage()) {
  if (!root) return;
  if (root.nodeType === Node.TEXT_NODE) { translateTextNode(root, language); return; }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
  if (root.nodeType === Node.ELEMENT_NODE) {
    const tag = root.tagName?.toLowerCase();
    if (tag === "script" || tag === "style") return;
    translateElementAttrs(root, language);
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let node = walker.currentNode;
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) translateTextNode(node, language);
    else translateElementAttrs(node, language);
    node = walker.nextNode();
  }
}

export function applyLanguage(language = getLanguage()) {
  const normalized = normalizeLanguage(language);
  document.documentElement.lang = normalized;
  translateSubtree(document.body, normalized);
  return normalized;
}

export function setLanguage(language) {
  const normalized = normalizeLanguage(language);
  localStorage.setItem(LANGUAGE_KEY, normalized);
  applyLanguage(normalized);
  return normalized;
}

export function localeForLanguage(language = getLanguage()) {
  return ({ en: "en-US", fr: "fr-FR", es: "es-ES", de: "de-DE" })[normalizeLanguage(language)] || "en-US";
}

export function initializeI18n() {
  applyLanguage(getLanguage());
  if (observer) return;
  observer = new MutationObserver((mutations) => {
    const lang = getLanguage();
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        const node = mutation.target;
        if ((node.nodeValue ?? "") === textRendered.get(node)) continue;
        translateTextNode(node, lang, true);
      } else if (mutation.type === "childList") {
        for (const node of mutation.addedNodes) translateSubtree(node, lang);
      } else if (mutation.type === "attributes") {
        translateElementAttrs(mutation.target, lang);
      }
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: TRANSLATED_ATTRS });
}
