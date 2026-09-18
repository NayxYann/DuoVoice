# DuoVoice updater — mise en place GitHub

Le système d'update est basé sur le plugin officiel Tauri Updater et les GitHub Releases.

## 1. Générer les clés

Depuis la racine du projet :

```bash
npm install
npm run tauri signer generate -- -w ~/.tauri/duovoice.key
```

La commande fournit une clé publique et une clé privée. La clé privée ne doit jamais être commitée.

## 2. Secrets GitHub

Dans **Settings → Secrets and variables → Actions**, créer :

- `TAURI_SIGNING_PRIVATE_KEY` : contenu de la clé privée.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` : mot de passe choisi pour la clé, si applicable.
La clé publique et l'URL du manifeste sont déjà intégrées dans `src-tauri/tauri.release.conf.json`.

## 3. Première release

Modifier le code, incrémenter la version dans `package.json` et `src-tauri/Cargo.toml` / `src-tauri/tauri.conf.json`, puis pousser un tag :

```bash
git add .
git commit -m "Release v1.0.0"
git tag v1.0.0
git push origin main --tags
```

Le workflow `.github/workflows/release.yml` :

1. construit Windows ;
2. crée la GitHub Release ;
3. publie les artefacts signés et `latest.json` ;
4. construit Linux ensuite et ajoute ses artefacts à la même release.

Le fichier `latest.json` sert de manifeste à l'application. Il indique la version publiée, l'URL de l'artefact et sa signature.

## 4. À chaque future version

Exemple :

```bash
git add .
git commit -m "Release v1.0.1"
git tag v1.0.1
git push origin main --tags
```

Les utilisateurs qui ont DuoVoice installé voient alors automatiquement la nouvelle version dans la bannière en haut de l'application. Cliquer dessus télécharge et installe la mise à jour.

## Important

Ne change jamais la clé de signature après une première release destinée aux utilisateurs existants. La clé publique est embarquée dans l'application et sert à vérifier que les nouveaux artefacts sont bien signés avec la clé privée correspondante.
