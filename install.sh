#!/usr/bin/env bash
# gascroll installer — build the library, install it, hook it into gnome-shell,
# install the GNOME Shell extension that drives it.
#
#   ./install.sh                  install everything
#   ./install.sh --factor 0.20    also set the initial factor
#   ./install.sh --no-extension   library + hook only
#   ./install.sh --uuid my@id     use a different extension uuid
set -euo pipefail

UUID="gascroll@ga"
FACTOR=""
WITH_EXT=1
HERE="$(cd "$(dirname "$0")" && pwd)"

while [ $# -gt 0 ]; do
    case "$1" in
        --uuid) UUID="$2"; shift 2 ;;
        --factor) FACTOR="$2"; shift 2 ;;
        --no-extension) WITH_EXT=0; shift ;;
        -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
        *) echo "unknown option: $1"; exit 1 ;;
    esac
done

LIBDIR="$HOME/.local/lib"
LIB="$LIBDIR/libgascroll.so"
CONF="$HOME/.config/gascroll.conf"
DROPIN="$HOME/.config/systemd/user/org.gnome.Shell@.service.d/override.conf"
EXTDIR="$HOME/.local/share/gnome-shell/extensions/$UUID"
BUILD="$(mktemp -d)"

command -v gcc >/dev/null || { echo "gcc not found — install build-essential first"; exit 1; }

echo "==> building $LIB"
mkdir -p "$LIBDIR"
gcc -shared -fPIC -O2 -Wall -Wextra -o "$BUILD/libgascroll.so" "$HERE/src/gascroll.c" -ldl -lm
# atomic replace: gnome-shell may have the old inode mapped right now
cp -f "$BUILD/libgascroll.so" "$LIB.tmp" && mv -f "$LIB.tmp" "$LIB"

echo "==> config $CONF"
mkdir -p "$(dirname "$CONF")"
if [ ! -f "$CONF" ]; then
    printf 'enabled=1\nfactor=%s\ndevice=Touchpad\n' "${FACTOR:-0.27}" > "$CONF"
else
    [ -n "$FACTOR" ] && sed -i "s/^factor=.*/factor=$FACTOR/" "$CONF"
fi
sed -i 's/^enabled=.*/enabled=1/' "$CONF" 2>/dev/null || true
grep -q '^enabled=' "$CONF" || echo 'enabled=1' >> "$CONF"
cat "$CONF"

echo "==> systemd drop-in $DROPIN"
mkdir -p "$(dirname "$DROPIN")"
printf '[Service]\nEnvironment=LD_PRELOAD=%s\nEnvironment=GASCROLL_CONF=%s\n' "$LIB" "$CONF" > "$DROPIN"
# clean up the per-instance drop-in older versions used
rm -f "$HOME/.config/systemd/user/org.gnome.Shell@ubuntu.service.d/override.conf" 2>/dev/null || true
rmdir "$HOME/.config/systemd/user/org.gnome.Shell@ubuntu.service.d" 2>/dev/null || true
systemctl --user daemon-reload 2>/dev/null || true

echo "==> CLI $HOME/.local/bin/gascroll"
mkdir -p "$HOME/.local/bin"
install -m 755 "$HERE/bin/gascroll" "$HOME/.local/bin/gascroll"

if [ "$WITH_EXT" = 1 ]; then
    echo "==> GNOME extension $UUID -> $EXTDIR"
    rm -rf "$EXTDIR"
    mkdir -p "$EXTDIR/shim"
    cp -f "$HERE"/extension/*.js "$HERE"/extension/metadata.json "$EXTDIR/"
    cp -f "$HERE/src/gascroll.c" "$EXTDIR/shim/gascroll.c"
    python3 - "$UUID" "$EXTDIR" <<'PY'
import json, sys, pathlib
uuid, extdir = sys.argv[1], pathlib.Path(sys.argv[2])
m = json.loads((extdir / 'metadata.json').read_text())
m['uuid'] = uuid
(extdir / 'metadata.json').write_text(json.dumps(m, indent=2, ensure_ascii=False) + '\n')
PY
    CUR="$(gsettings get org.gnome.shell enabled-extensions 2>/dev/null || echo '[]')"
    if ! printf '%s' "$CUR" | grep -q "$UUID"; then
        NEW="$(python3 - "$CUR" "$UUID" <<'PY'
import ast, sys
lst = ast.literal_eval(sys.argv[1])
if sys.argv[2] not in lst:
    lst.append(sys.argv[2])
print(str(lst).replace("'", '"'))
PY
)"
        gsettings set org.gnome.shell enabled-extensions "$NEW" 2>/dev/null || true
    fi
fi

rm -rf "$BUILD"
cat <<EOF

Done.

  library : $LIB
  config  : $CONF      (edit factor= and it applies within 1s, no re-login)
  hook    : $DROPIN

  !!! Log out and back in once: gnome-shell only reads LD_PRELOAD at start,
      and GNOME on Wayland only discovers new extensions at session start.
      After that, adjustments are live.
EOF
