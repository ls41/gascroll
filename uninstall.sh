#!/usr/bin/env bash
# gascroll uninstaller — undo everything install.sh did.
#   ./uninstall.sh            remove hook + extension, keep the library and config
#   ./uninstall.sh --purge    also delete the library and the config file
set -euo pipefail

UUID="gascroll@ga"
PURGE=0
[ "${1:-}" = "--purge" ] && PURGE=1

LIB="$HOME/.local/lib/libgascroll.so"
CONF="$HOME/.config/gascroll.conf"
DROPIN="$HOME/.config/systemd/user/org.gnome.Shell@.service.d/override.conf"
OLD_DROPIN="$HOME/.config/systemd/user/org.gnome.Shell@ubuntu.service.d/override.conf"
EXTDIR="$HOME/.local/share/gnome-shell/extensions/$UUID"

echo "==> disabling scaling (takes effect within 1s in the running session)"
if [ -f "$CONF" ]; then
    sed -i 's/^enabled=.*/enabled=0/' "$CONF" || true
    grep -q '^enabled=' "$CONF" || echo 'enabled=0' >> "$CONF"
fi

echo "==> removing systemd drop-ins"
rm -f "$DROPIN" "$OLD_DROPIN"
rmdir "$HOME/.config/systemd/user/org.gnome.Shell@.service.d" 2>/dev/null || true
systemctl --user daemon-reload 2>/dev/null || true

echo "==> removing GNOME extension"
rm -rf "$EXTDIR"
CUR="$(gsettings get org.gnome.shell enabled-extensions 2>/dev/null || echo '[]')"
if printf '%s' "$CUR" | grep -q "$UUID"; then
    NEW="$(python3 - "$CUR" "$UUID" <<'PY'
import ast, sys
lst = [x for x in ast.literal_eval(sys.argv[1]) if x != sys.argv[2]]
print(str(lst).replace("'", '"'))
PY
)"
    gsettings set org.gnome.shell enabled-extensions "$NEW" 2>/dev/null || true
fi

if [ "$PURGE" = 1 ]; then
    echo "==> purging library and config"
    rm -f "$LIB" "$CONF"
fi

echo
echo "Done. Log out and back in to fully unload the library from gnome-shell."
