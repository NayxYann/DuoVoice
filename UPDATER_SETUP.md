# DuoVoice — publication et updater

## 1. Clés de signature

La version 1.3.3 utilise la clé publique déjà présente dans `src-tauri/tauri.conf.json`.

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

## 4. Publier la 1.3.3

Après avoir copié les fichiers corrigés :

```bash
git add .
git commit -m "release: DuoVoice 1.3.3"
git push origin main
```

Aucun build ni aucune release ne démarre automatiquement au push. Ouvrez ensuite **GitHub → Actions → Release DuoVoice → Run workflow** et saisissez `v1.3.3`. Le workflow utilise cette valeur comme tag de release ; il n’est pas nécessaire de pousser manuellement un tag avant de le lancer.

Le workflow `.github/workflows/release.yml` construit Windows d'abord, puis Linux, afin d'ajouter les plateformes à la même GitHub Release sans lancer les publications en parallèle.

## 5. Vérification de la release

La release doit contenir au minimum :

- installateur Windows NSIS `.exe` ;
- MSI `.msi` ;
- signatures `.sig` ;
- AppImage Linux ;
- paquet `.deb` ;
- `latest.json`.

Une version installée avec une autre clé publique ne peut pas accepter une release signée par la nouvelle clé : dans ce cas, une réinstallation manuelle de la build 1.3.3 signée avec la nouvelle paire de clés est nécessaire une fois.

## Retour à une version précédente (1.3.3+)

Depuis **Paramètres → Version**, DuoVoice peut proposer les releases stables antérieures disponibles sur GitHub et réinstaller celle choisie.

Le mécanisme utilise le fichier `latest.json` attaché à la release ciblée, par exemple :

`https://github.com/NayxYann/DuoVoice/releases/download/v1.3.3/latest.json`

La vérification de signature Tauri reste active pendant un retour en arrière. Une ancienne release n'est donc installable automatiquement que si :

- elle possède bien un asset `latest.json` ;
- ses artefacts updater sont encore présents sur GitHub ;
- elle a été signée avec une clé correspondant à la clé publique intégrée dans la version actuellement installée.

DuoVoice n'affiche dans le sélecteur que les releases stables antérieures qui contiennent `latest.json`.
