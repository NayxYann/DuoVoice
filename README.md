# DuoVoice 1.2.8

DuoVoice est une application légère d’intercom audio bidirectionnel pour Windows et Linux, pensée pour fonctionner sur un réseau local avec une interface simple et un impact minimal sur les ressources.

## Nouveautés 1.2.8

- Harmonisation complète du bouton **Muet** entre l’application principale et le panneau systray.
- Même pictogramme microphone et même barre diagonale lorsque le mode Muet est actif.
- Même palette pour les deux interfaces : état normal sombre, survol identique et état Muet rouge/danger.
- Les couleurs utilisent désormais les mêmes variables sémantiques (`danger`, bordure et fond) afin d’éviter les écarts visuels entre l’application et le systray.
- Conservation de toutes les fonctions de la 1.2.7, notamment l’option d’affichage de l’icône systray et les workflows GitHub manuels.

- **Icône du systray désactivable** : une nouvelle option « Afficher l’icône dans le systray » est disponible juste sous « Démarrer minimisé dans le tray ».
- **Activée par défaut après installation** : si aucun choix n’a encore été enregistré, l’icône DuoVoice reste visible comme auparavant.
- **Préférence persistante** : le choix est conservé entre les lancements et les mises à jour.
- **Sécurité d’accès** : lorsque l’icône du systray est désactivée, « Démarrer minimisé dans le tray » est automatiquement désactivé et l’action de fermeture bascule sur « Quitter DuoVoice » afin d’éviter de rendre l’application invisible et impossible à rouvrir.
- **Masquage immédiat** : désactiver l’option masque aussi les panneaux clic gauche/clic droit s’ils étaient ouverts.
- **Icône Paramètres corrigée dans le contrôle rapide** : remplacement du pictogramme construit en CSS par un SVG d’engrenage propre, centré et cohérent avec les autres icônes.
- **Vérification des icônes du panneau rapide** : alignement optique et centrage consolidés pour conserver des tuiles visuellement homogènes.
- Tous les acquis de la 1.2.6 sont conservés : contours systray simplifiés, Muet harmonisé, échelle commune aux menus clic gauche/clic droit, palette cohérente, nom de machine personnalisable, favoris persistants, updater signé et workflows GitHub manuels.

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
5. saisir le tag voulu, par exemple `v1.2.8`.

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
