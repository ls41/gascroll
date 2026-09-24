/* gascroll — shared helpers, importable from BOTH extension.js and prefs.js.
 *
 * IMPORTANT: this module must not import anything from
 *   resource:///org/gnome/Shell/Extensions/js/extensions/...
 * The Shell-only `extension.js` resource is NOT registered in the prefs
 * process, so importing it here would break the settings dialog with
 * "ImportError: Unable to load file from: .../extensions/extension.js".
 *
 * SPDX-License-Identifier: MIT
 */
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

export const HOME = GLib.get_home_dir();
export const CONF_PATH = `${HOME}/.config/gascroll.conf`;
export const LIB_PATH = `${HOME}/.local/lib/libgascroll.so`;
export const DROPIN_DIR = `${HOME}/.config/systemd/user/org.gnome.Shell@.service.d`;
export const DROPIN_PATH = `${DROPIN_DIR}/override.conf`;
export const LEGACY_DROPIN = `${HOME}/.config/systemd/user/org.gnome.Shell@ubuntu.service.d/override.conf`;
export const DEFAULT_CONF = {enabled: 1, factor: 0.27, device: 'Touchpad'};

export const RESTART_NOTE =
    '首次安装或移除注入后需要注销重登一次（gnome-shell 只在启动时读取 LD_PRELOAD，' +
    'GNOME 在 Wayland 下也只在会话开始时扫描新扩展）。之后调倍率立即生效。';

export function readConf() {
    const o = {...DEFAULT_CONF};
    try {
        const [ok, bytes] = GLib.file_get_contents(CONF_PATH);
        if (ok) {
            for (const line of new TextDecoder().decode(bytes).split('\n')) {
                let m;
                if ((m = line.match(/^\s*enabled\s*=\s*(\d+)/))) o.enabled = parseInt(m[1]);
                else if ((m = line.match(/^\s*factor\s*=\s*([\d.]+)/))) o.factor = parseFloat(m[1]);
                else if ((m = line.match(/^\s*device\s*=\s*(\S+)/))) o.device = m[1];
            }
        }
    } catch (e) { logError(e, 'gascroll: readConf'); }
    return o;
}

export function writeConf(o) {
    try {
        GLib.file_set_contents(CONF_PATH,
            '# gascroll — touchpad scroll speed\n' +
            '# re-read once per second, changes apply live\n' +
            `enabled=${o.enabled ? 1 : 0}\n` +
            `factor=${Number(o.factor).toFixed(2)}\n` +
            `device=${o.device || ''}\n`);
    } catch (e) { logError(e, 'gascroll: writeConf'); }
    return o;
}

/** is the preload library mapped into this process (the prefs process inherits it from the shell) */
export function shimLoaded() {
    try {
        const [ok, bytes] = GLib.file_get_contents('/proc/self/maps');
        if (ok && new TextDecoder().decode(bytes).includes('libgascroll'))
            return true;
    } catch (e) { /* ignore */ }
    return false;
}

export function hookInstalled() {
    return GLib.file_test(DROPIN_PATH, GLib.FileTest.EXISTS) &&
           GLib.file_test(LIB_PATH, GLib.FileTest.EXISTS);
}

function run(argv) {
    try {
        const p = Gio.Subprocess.new(argv,
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        const [, out, err] = p.communicate_utf8(null, null);
        return {ok: p.get_successful(), out: out || '', err: err || ''};
    } catch (e) {
        return {ok: false, out: '', err: String(e)};
    }
}

/** Build + install the injected library and the systemd drop-in. */
export function installHook(extDir) {
    if (!extDir)
        return {ok: false, err: 'extension path unknown'};

    const src = `${extDir}/shim/gascroll.c`;
    if (!GLib.file_test(src, GLib.FileTest.EXISTS))
        return {ok: false, err: `bundled source not found: ${src}`};
    if (!GLib.find_program_in_path('gcc'))
        return {ok: false, err: 'gcc not found — install gcc/build-essential first'};

    GLib.mkdir_with_parents(`${HOME}/.local/lib`, 0o755);
    const r = run(['gcc', '-shared', '-fPIC', '-O2', '-o', `${LIB_PATH}.tmp`, src, '-ldl', '-lm']);
    if (!r.ok)
        return {ok: false, err: r.err || r.out};

    // atomic replace: gnome-shell may have the previous inode mapped right now
    if (!run(['mv', '-f', `${LIB_PATH}.tmp`, LIB_PATH]).ok)
        return {ok: false, err: 'failed to move the built library into place'};

    GLib.mkdir_with_parents(DROPIN_DIR, 0o755);
    GLib.file_set_contents(DROPIN_PATH,
        `[Service]\nEnvironment=LD_PRELOAD=${LIB_PATH}\nEnvironment=GASCROLL_CONF=${CONF_PATH}\n`);
    // drop the per-instance drop-in an older version of this project created
    try {
        if (GLib.file_test(LEGACY_DROPIN, GLib.FileTest.EXISTS) &&
            GLib.file_get_contents(LEGACY_DROPIN)[1].toString().includes('libgascroll'))
            Gio.File.new_for_path(LEGACY_DROPIN).delete(null);
    } catch (e) { /* ignore */ }
    run(['systemctl', '--user', 'daemon-reload']);
    return {ok: true, out: `${LIB_PATH}\n${DROPIN_PATH}`};
}

export function removeHook() {
    for (const f of [DROPIN_PATH, LEGACY_DROPIN]) {
        try { Gio.File.new_for_path(f).delete(null); } catch (e) { /* ignore */ }
    }
    run(['systemctl', '--user', 'daemon-reload']);
    return {ok: true};
}
