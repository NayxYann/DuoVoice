# DuoVoice updater notes

DuoVoice uses the Tauri updater with signed release artifacts.

## Windows release artifacts

The project is Windows-only. Release builds generate NSIS and MSI installers, while the updater manifest is published as `latest.json` together with the signed updater payload/signature.

The public updater endpoint configured in `src-tauri/tauri.conf.json` is:

```text
https://github.com/NayxYann/DuoVoice/releases/latest/download/latest.json
```

## Signing

Release automation expects the standard Tauri signing secrets:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

The public verification key remains in `src-tauri/tauri.conf.json`. The private key must never be committed to the repository.

## Rollback / version picker

The in-app version picker reads published GitHub Releases and displays each release's public release name. Technical installation still uses the semantic `tag_name` and signed updater manifest associated with that tag.

Only signed, compatible Windows updater artifacts can be installed through DuoVoice.
