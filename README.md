# DuoVoice 1.3.3

## Nouveautés 1.3.3

- La zone **logo + DuoVoice + version** de l’application principale ouvre maintenant la page GitHub officielle du projet.
- Le mini-panel systray (clic gauche) reprend exactement le même comportement sur son en-tête **logo + nom + version**.
- Le menu systray clic droit ajoute une entrée **Page GitHub** avec l’icône GitHub.
- Les trois accès utilisent le navigateur système et gardent la même logique visuelle de survol / focus.
- Les thèmes et la palette de la 1.3.2 restent inchangés.


DuoVoice est une application légère d’intercom audio bidirectionnel pour Windows et Linux, pensée pour fonctionner sur un réseau local avec une interface simple et un impact minimal sur les ressources.

## Nouveautés 1.3.2

- **Palette unifiée** : les couleurs de l’application sont désormais pilotées par un jeu commun de variables (fond, surfaces, bordures, texte, accent, succès, danger et mise à jour) afin d’éviter les écarts visuels entre l’interface principale, le panneau systray et le menu clic droit.
- **Couleur d’accent mieux cadrée** : la couleur choisie dans Apparence sert aux actions, sliders, focus et sélections. Le vert est réservé aux succès/états positifs, le rouge aux actions dangereuses et le rose-violet à une mise à jour disponible. L’état « à jour » redevient neutre pour ne pas surcharger l’écran.
- **Thèmes++** : nouvelle section sous les couleurs d’accent avec six palettes complètes : **DuoVoice**, **Windows XP**, **Axolotl**, **Cherry Blossom**, **Sage** et **Ocean**. Les thèmes modifient ensemble le fond, les panneaux, les bordures, les textes et les couleurs fonctionnelles.
- **Lisibilité préservée** : Windows XP et Cherry Blossom utilisent automatiquement une palette claire avec texte sombre ; les autres thèmes conservent des contrastes élevés sur fond sombre.
- **Systray synchronisé avec les thèmes** : le clic gauche et le clic droit utilisent la même palette que l’application et se mettent à jour immédiatement lorsqu’un thème ou une couleur est sélectionné.
- **Bouton de déconnexion clarifié** : lorsqu’une session est active, l’action « Se déconnecter » utilise désormais la couleur danger plutôt que la couleur d’accent du thème.
- Les corrections audio de la **1.3.1** restent conservées : changement de périphérique à chaud et synchronisation complète du Muet entre l’application et le systray.

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
5. saisir le tag voulu, par exemple `v1.3.3`.

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
