# DuoVoice

DuoVoice is a small local-network intercom for Windows and Linux.

## V1 test build

- Bidirectional LAN audio over UDP.
- 48 kHz PCM, 10 ms frames.
- Microphone and output device selection at connection time.
- Remote volume.
- Mute.
- LAN peer discovery.
- System tray.
- No account or server.

### Important V1 limitation

For the first test build, the selected input and output devices must expose a 48 kHz default configuration. The current transport is intentionally uncompressed PCM so the first build avoids a native Opus toolchain dependency. CPAL provides cross-platform audio I/O (WASAPI on Windows and ALSA/PipeWire paths on Linux). Opus can be added after the basic audio path is validated.

### Firewall

Allow UDP 39471 (discovery) and UDP 39472 (audio) on the local network.

## GitHub build

The repository contains `.github/workflows/build.yml`. Push to `main` or run the workflow manually from the Actions tab. Windows installers (`.exe`/`.msi`) and Linux packages (`.AppImage`/`.deb`) are uploaded as workflow artifacts.


## Démarrage automatique

DuoVoice inclut le plugin officiel Tauri Autostart. Depuis **Réglages**, cochez **Démarrage automatique**. Le réglage est pris en charge sur Windows et Linux. Au démarrage automatique, DuoVoice se lance directement dans le tray.

Le bouton `X` masque également la fenêtre dans le tray au lieu de quitter l'application. Pour quitter complètement, utilisez **Quitter** dans le menu du tray.

Le plugin officiel Tauri documente le support Windows/Linux et les commandes enable/disable/is-enabled : https://v2.tauri.app/plugin/autostart/


## Diagnostic Windows
### Journal de diagnostic

DuoVoice conserve un journal technique optionnel dans `duovoice.log` pour faciliter le diagnostic des problèmes de démarrage, audio ou réseau. Le fichier est automatiquement limité à **2 Mo**, avec au maximum **une archive** (`duovoice.log.1`) afin d'éviter l'accumulation de fichiers.
## v0.2.3
Stability pass: discovery traffic/churn reduced and startup/runtime behavior kept conservative. Audio transport remains PCM/UDP in this build.

## v0.3.0
Interface refondue, volume jusqu'à 200 %, mute disponible hors connexion, préférences de volume persistantes, affichage de la latence audio estimée et accès Paramètres depuis le tray.


## v0.3.1
- Finitions UI : volume adaptatif 0–100 % / 0–200 % et sauvegarde.
- Palette de couleurs douces personnalisable.
- Indicateur de latence conservé sans valeur artificielle lorsqu'aucune mesure réelle n'est disponible.


## v2.0

### Mise à jour UI 1.0
- Ajout des favoris de machines/IP directement depuis le sélecteur avec l’icône étoile.
- Les favoris affichent leur disponibilité en temps réel ; un favori disponible est cliquable pour se connecter directement.
- Les panneaux Connexion et Audio sont alignés à la même hauteur sur la vue large/carrée.
- Palette d’apparence légèrement plus saturée tout en conservant le thème sombre.
- Mesure RTT réseau réelle en temps réel pendant une connexion.
- Palette de couleurs douces persistante.
- Barre de volume 0–100 %, extension à 200 % lorsque l’amplification est activée.
- Fenêtre principale carrée par défaut (720 × 720) avec mise en page responsive lors du redimensionnement.


## Réduction de bruit

La version 1.0 conserve les améliorations de la version 2.0.0 et ajoute un journal de diagnostic borné. RNNoise est intégré côté Rust pour traiter le microphone localement avant l'envoi UDP. Le traitement est explicitement mono, 48 kHz, par trames de 480 échantillons (10 ms), conformément au fonctionnement de RNNoise.

Le signal sec est retardé du même bloc de 10 ms que le traitement RNNoise avant le mélange d'intensité. Cela évite de mélanger un signal direct avec sa version retardée, ce qui produirait un effet de voix doublée.

La fonction est désactivable à chaud. Son état ON/OFF et son intensité sont sauvegardés localement. Le réglage d'intensité agit comme un mixage entre le signal brut et le signal traité, avec trois préréglages : Naturel, Équilibré et Agressif.
