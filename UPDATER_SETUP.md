# DuoVoice — publication et updater

## 1. Clés de signature

La version 1.1.7 utilise la clé publique déjà présente dans `src-tauri/tauri.conf.json`.

La clé privée correspondante reste uniquement dans GitHub Actions, dans :

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

Ne committez jamais la clé privée.

## 2. Configuration

L'endpoint updater est défini directement dans `src-tauri/tauri.conf.json` :

```text
https://github.com/NayxYann/DuoVoice/releases/latest/download/latest.json
```

`src-tauri/tauri.release.conf.json` active uniquement `createUpdaterArtifacts` lors d'une release. Il n'y a plus de placeholder à remplacer par `sed` dans GitHub Actions.

## 3. Nettoyage Git obligatoire

`node_modules` ne doit pas être suivi par Git. Si l'ancien dépôt le contient encore :

```bash
git rm -r --cached node_modules
git add .gitignore
git commit -m "chore: stop tracking node_modules"
```

Le workflow vérifie ce point avant de construire.

## 4. Publier la 1.1.7

Après avoir copié les fichiers corrigés :

```bash
git add .
git commit -m "release: DuoVoice 1.1.7"
git push origin main
```

Si le tag distant `v1.1.7` a bien été supprimé :

```bash
git tag -d v1.1.7 2>/dev/null || true
git tag v1.1.7
git push origin v1.1.7
```

Le workflow `.github/workflows/release.yml` construit Windows d'abord, puis Linux, afin d'ajouter les plateformes à la même GitHub Release sans lancer les publications en parallèle.

## 5. Vérification de la release

La release doit contenir au minimum :

- installateur Windows NSIS `.exe` ;
- MSI `.msi` ;
- signatures `.sig` ;
- AppImage Linux ;
- paquet `.deb` ;
- `latest.json`.

Une version installée avec une autre clé publique ne peut pas accepter une release signée par la nouvelle clé : dans ce cas, une réinstallation manuelle de la build 1.1.7 signée avec la nouvelle paire de clés est nécessaire une fois.
