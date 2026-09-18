# DuoVoice 1.2.9

DuoVoice est une application légère d’intercom audio bidirectionnel pour Windows et Linux, pensée pour fonctionner sur un réseau local avec une interface simple et un impact minimal sur les ressources.

## Nouveautés 1.2.9

- **Build Vite corrigé** : suppression de la seconde déclaration de `escapeHtml`, qui provoquait l'erreur `Identifier "escapeHtml" has already been declared` pendant `npm run build`.
- **Sélecteur de version redessiné** : le contrôle « Version installée » reprend désormais les dimensions, bordures, espacements et états hover de DuoVoice au lieu d’une grande ligne grise.
- **Titres GitHub affichés dans l’historique** : la liste montre uniquement le champ `name` de chaque GitHub Release (avec repli sur le tag si le titre est vide). Le `tag_name` reste utilisé uniquement en interne pour comparer et installer la bonne version.
- **Démarrage encore fiabilisé** : un échec non critique de redimensionnement ou de systray ne peut plus empêcher l’ouverture de la fenêtre principale.
- **Préférence systray protégée** : une erreur temporaire du backend ne peut plus inverser ni écraser le choix enregistré de l’utilisateur.
- **Passe de stabilisation complète après la build 1.2.9 retirée** : correction de la régression JavaScript qui interrompait l’initialisation de l’application après la migration des icônes.
- **Updater rétabli** : la recherche, l’affichage et l’installation des nouvelles versions fonctionnent de nouveau normalement.
- **Détection des périphériques audio rétablie** : les listes microphone / sortie sont de nouveau chargées au démarrage.
- **Détection réseau et connexion distante rétablies** : découverte LAN, favoris, connexion et état audio ne sont plus bloqués par l’erreur d’initialisation.
- **Préférences de démarrage fiabilisées** : « Démarrer minimisé dans le tray » est de nouveau enregistré et restauré correctement ; désactiver l’option ouvre normalement la fenêtre au démarrage.
- **Préférence d’icône systray conservée** : l’icône reste activée par défaut après installation et le choix utilisateur reste persistant.
- **Icônes unifiées conservées** : la famille SVG unifiée reste inchangée ; les icônes dynamiques utilisent désormais les mêmes SVG sans casser le code métier.
- **Retour à une version précédente** : dans Paramètres → Version, le numéro de version installé est maintenant cliquable. DuoVoice affiche les anciennes releases stables compatibles disposant d’un `latest.json` signé.
- **Downgrade signé** : une version précédente sélectionnée est téléchargée et installée via l’updater Tauri en conservant la vérification de signature.
- **Confirmation intégrée** avant l’installation d’une ancienne version, sans popup système native.
- **Workflows GitHub toujours manuels** : Push origin ne déclenche ni build ni release automatiquement.

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
5. saisir le tag voulu, par exemple `v1.2.9`.

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
