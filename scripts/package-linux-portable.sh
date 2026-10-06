#!/usr/bin/env bash
set -euo pipefail
# Extracting does not mount the AppImage and therefore does not require FUSE.
version=$(node -p "require('./package.json').version")
cd src-tauri/target/release/bundle/appimage
appimages=(*.AppImage)
if [[ ${#appimages[@]} != 1 || ! -f "${appimages[0]}" ]]; then
  echo "Expected one Linux AppImage" >&2
  exit 1
fi
chmod +x "${appimages[0]}"
"./${appimages[0]}" --appimage-extract >/dev/null
mv squashfs-root DuoVoice
tar -czf "DuoVoice_${version}_linux-x86_64-portable.tar.gz" DuoVoice
