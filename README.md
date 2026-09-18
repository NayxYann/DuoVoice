# DuoVoice 1.2.4

DuoVoice est une application légère d’intercom audio bidirectionnel pour Windows et Linux, pensée pour fonctionner sur un réseau local avec une interface simple et un impact minimal sur les ressources.

## Nouveautés 1.2.4

- **Nom de machine plus explicite** : le bouton utilise maintenant une coche dans les deux états. La coche est **verte et cliquable** uniquement lorsqu’un nouveau nom attend d’être validé ; elle devient **grise et désactivée** dès que le nom affiché est déjà appliqué.
- **Icônes recentrées** dans les boutons carrés et les tuiles du contrôle rapide, avec un alignement plus stable pendant les animations de clic et de rechargement.
- **Palette harmonisée** entre l’application principale, le mini-panneau systray et les confirmations : mêmes teintes sémantiques pour le rouge/danger, le vert/validation et les états neutres. Le rose-violet reste réservé à la détection d’une mise à jour disponible.
- **Nouveau menu clic droit du systray entièrement personnalisé** : le menu natif Windows est remplacé par une petite popup DuoVoice reprenant les mêmes formes, espacements, couleurs, survols et retours de clic que l’application.
- Le menu clic droit ne contient plus « Contrôle rapide » : il propose uniquement **Ouvrir DuoVoice**, **Paramètres** et **Quitter**.
- La popup clic droit est **davantage surélevée** par rapport à la barre des tâches et légèrement décalée horizontalement, tout en restant automatiquement contrainte à l’écran.
- Le mini-panneau du clic gauche reste centré sur l’icône DuoVoice et conserve un très fin espace au-dessus de la barre des tâches.
- Les comportements introduits en 1.2.3 sont conservés : retours visuels sur les actions, animation de rechargement des machines, validation claire des échelles, bouton de réinitialisation grisé quand les valeurs sont déjà par défaut, mise à jour disponible rose-violet, échelle systray limitée à **90 / 100 / 110 / 120 %**, nom réseau personnalisable et favoris persistants.

## Fonctionnalités principales

- audio bidirectionnel simultané sur le LAN ;
- transport PCM mono 48 kHz / 16 bits, trames de 10 ms ;
- sélection et mémorisation du microphone et de la sortie audio ;
- volume distant 0–100 %, avec option jusqu’à 200 % ;
- muet disponible même hors connexion ;
- réduction de bruit RNNoise réglable et persistante ;
- détection automatique des autres PC DuoVoice ;
- nom de client personnalisable et diffusé sur le réseau ;
- ajout d’adresses IPv4 manuelles et favoris persistants ;
- reconnexion et resynchronisation du flux audio après coupure/reconnexion d’un seul côté ;
- mesure RTT réelle pendant la connexion ;
- mini-interface de contrôle depuis le systray ;
- fermeture vers le tray ou fermeture complète au choix ;
- démarrage automatique Windows/Linux ;
- option indépendante « Démarrer minimisé dans le tray » ;
- couleur et échelle d’interface persistantes ;
- échelle indépendante et sécurisée du mini-panneau systray ;
- mise à jour automatique signée via GitHub Releases ;
- journal borné à 2 Mo avec une seule archive `duovoice.log.1`.

## Réseau

DuoVoice utilise :

- UDP `39471` pour la découverte ;
- UDP `39472` pour l’audio et les sondes de latence ;
- TCP `39473` sur `127.0.0.1` uniquement pour empêcher plusieurs instances locales.

Si un pare-feu bloque DuoVoice, autorisez les ports UDP 39471 et 39472 sur le réseau privé/local.

## Installation des dépendances

Depuis la racine du projet :

```bash
npm install
```

`node_modules` ne doit jamais être commit dans Git. Le `.gitignore` du projet l’exclut volontairement.

Si une ancienne version du dépôt suivait déjà `node_modules`, nettoyez une seule fois l’index Git :

```bash
git rm -r --cached node_modules
```

puis réinstallez localement avec `npm install`.

## Développement

Frontend :

```bash
npm run dev
```

Application Tauri :

```bash
npm run tauri -- dev
```

Build local :

```bash
npm run tauri -- build
```

## GitHub Actions

Les workflows sont volontairement **manuels uniquement**.

Un commit ou un **Push origin** ne lance aucun build automatiquement.

Pour lancer un build :

1. pousser les fichiers sur GitHub ;
2. ouvrir l’onglet **Actions** ;
3. choisir **Build DuoVoice** ;
4. cliquer sur **Run workflow**.

Pour publier une release :

1. pousser les fichiers sur GitHub ;
2. ouvrir l’onglet **Actions** ;
3. choisir **Release DuoVoice** ;
4. cliquer sur **Run workflow** ;
5. saisir le tag voulu, par exemple `v1.2.4`.

Le build produit notamment :

- Windows : NSIS `.exe` + MSI `.msi` ;
- Linux : AppImage + `.deb`.

Le workflow refuse explicitement un dépôt dans lequel `node_modules` serait suivi par Git. Cela évite notamment les erreurs `tauri: Permission denied` et `vite: Permission denied` sur Linux.

## Mise à jour automatique

Le fichier public de vérification est :

`https://github.com/NayxYann/DuoVoice/releases/latest/download/latest.json`

La clé publique est intégrée à `src-tauri/tauri.conf.json`. La clé privée ne doit jamais être présente dans le dépôt.

Les secrets GitHub Actions nécessaires à la signature sont :

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

Le workflow de release crée les artefacts de mise à jour et leurs signatures. Sur Windows, le manifeste préfère l’installateur NSIS pour la mise à jour.

Consultez `UPDATER_SETUP.md` pour la procédure de publication.

## Journal de diagnostic

Le journal technique est écrit dans :

- Windows : `%LOCALAPPDATA%\\DuoVoice\\duovoice.log`
- Linux : `$XDG_DATA_HOME/DuoVoice/duovoice.log` ou `~/.local/share/DuoVoice/duovoice.log`

Il contient uniquement des événements utiles : démarrage, arrêt, erreurs réseau/audio/updater, connexion et déconnexion. Les paquets audio ne sont pas journalisés.
