# DuoVoice

**Version actuelle : 1.0.0**

DuoVoice est un intercom audio **local**, conçu pour Windows et Linux. Il permet de communiquer directement entre deux PC du même réseau local, sans compte ni serveur intermédiaire.

## Fonctionnalités

- Audio bidirectionnel en temps réel sur le LAN (UDP).
- Transport PCM mono 48 kHz avec des trames de 10 ms.
- Sélection du microphone et de la sortie audio.
- Connexion automatique par découverte LAN et ajout manuel d'une adresse IPv4.
- Favoris de machines/IP avec état de disponibilité et actions rapides.
- Volume distant de 0 à 100 %, extensible à 200 % avec l'amplification.
- Mute disponible même hors connexion.
- Réduction de bruit **RNNoise** traitée localement avant l'envoi réseau.
- Intensité RNNoise réglable avec les préréglages Naturel, Équilibré et Agressif.
- Mesure RTT réelle affichée comme latence audio pendant la connexion.
- Sélection et mémorisation des périphériques audio.
- Préférences persistantes : volume, amplification, mute, couleur et réduction de bruit.
- Interface sombre responsive et redimensionnable avec plusieurs couleurs d'accent.
- Icône dans le tray système, ouverture par clic gauche et accès aux paramètres depuis le menu du tray.
- Fermeture dans le tray configurable, avec masquage de la fenêtre de la barre des tâches.
- Démarrage automatique sous Windows et Linux, avec possibilité de démarrer directement dans le tray.
- Journal de diagnostic borné à 2 Mo avec une seule archive (`duovoice.log.1`).
- Vérification et installation des mises à jour via le plugin officiel Tauri Updater et GitHub Releases.

## Audio et réduction de bruit

Le transport audio utilise du PCM brut sur UDP afin de rester simple et léger. Les trames font 480 échantillons à 48 kHz, soit 10 ms. La pile audio sélectionne explicitement une configuration compatible 48 kHz afin de rester stable avec les périphériques supportés par CPAL.

RNNoise fonctionne côté Rust, localement sur le microphone, en mono 48 kHz par blocs de 480 échantillons. Le signal sec est retardé du même bloc que le traitement avant le mélange d'intensité, afin d'éviter l'effet de voix doublée. La fonction peut être activée ou désactivée à chaud et son état est mémorisé.

## Réseau et pare-feu

DuoVoice fonctionne uniquement sur le réseau local.

- **UDP 39471** : découverte des machines.
- **UDP 39472** : audio.

Autorisez ces deux ports dans le pare-feu local lorsque nécessaire.

La découverte tourne en arrière-plan et conserve les machines détectées pendant une courte période afin d'éviter les fluctuations d'affichage. Une adresse IPv4 peut également être ajoutée manuellement.

## Tray et démarrage

Dans **Paramètres**, vous pouvez activer le démarrage automatique. Lorsqu'il est lancé par l'autostart, DuoVoice peut démarrer directement dans le tray.

Le comportement du bouton **X** est configurable : réduire DuoVoice dans le tray ou quitter complètement l'application. En mode tray, la fenêtre est également retirée de la barre des tâches.

## Journal de diagnostic

DuoVoice écrit un journal technique pour faciliter le diagnostic des problèmes de démarrage, audio et réseau. Le fichier actif est `duovoice.log`. Il est limité à **2 Mo** et, lors de la rotation, une seule archive `duovoice.log.1` est conservée.

Les événements utiles peuvent notamment concerner le démarrage et l'arrêt, les connexions/déconnexions, les périphériques audio, la découverte réseau, les erreurs RNNoise et les plugins Tauri.

## Mise à jour automatique

DuoVoice utilise le plugin officiel Tauri Updater. L'application vérifie au lancement si une version plus récente est disponible. Lorsqu'une mise à jour est proposée, la bannière en haut de l'interface permet de lancer son téléchargement et son installation. La version installée est également affichée dans les paramètres.

Le workflow `.github/workflows/release.yml` publie les artefacts Windows et Linux sur une GitHub Release lorsqu'un tag `vX.Y.Z` est poussé. Il génère également le manifeste `latest.json` et les signatures nécessaires à l'updater.

## Build

Le workflow `.github/workflows/build.yml` construit DuoVoice pour Windows et Linux. Les artefacts produits sont :

- Windows : installateurs `.exe` et `.msi`.
- Linux : `.AppImage` et `.deb`.

Pour un build local :

```bash
npm install
npm run tauri -- build
```

## Publication d'une release

Avant la première release, consultez [`UPDATER_SETUP.md`](UPDATER_SETUP.md) pour la génération des clés et la configuration des secrets GitHub.

Une release suit le principe :

```bash
git add .
git commit -m "Release v1.0.0"
git tag v1.0.0
git push origin main --tags
```

Pour les versions suivantes, incrémentez la version selon le changement effectué et poussez le tag correspondant.

**Important :** la clé privée de signature Tauri ne doit jamais être commitée dans le dépôt.
