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
binary="squashfs-root/usr/bin/duovoice-linux"
if [[ ! -x "$binary" ]]; then
  echo "Linux AppImage is missing its executable: $binary" >&2
  exit 1
fi
python3 - "$binary" <<'PY'
from pathlib import Path
import sys

binary = Path(sys.argv[1]).read_bytes()
required = (
    b"DuoVoice Linux starting",
    b"list_linux_devices",
    b"linux_desktop",
    b"linux_startup",
    b"configure_linux_tray",
    b"linux_autostart_enabled",
    b"set_linux_autostart",
)
missing = [marker.decode() for marker in required if marker not in binary]
if missing:
    raise SystemExit("AppImage contains the wrong backend; missing Linux markers: " + ", ".join(missing))
print("Verified Linux backend and tray commands in AppImage executable")
PY
mv squashfs-root DuoVoice
tar -czf "DuoVoice_${version}_linux-x86_64-portable.tar.gz" DuoVoice
