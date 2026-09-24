/* Regression tests for two real bugs (keep both covered!):
 *
 * 1. extension.js must import the *Shell* resource with the lower-case path
 *      resource:///org/gnome/shell/extensions/extension.js
 *    The upper-case path
 *      resource:///org/gnome/Shell/Extensions/js/extensions/extension.js
 *    only exists inside the Extensions app, so the Shell fails to load the
 *    extension with "ImportError: ... extension.js (资源不存在)" and the
 *    Extensions app keeps showing that error for the whole session
 *    (the ERROR state is sticky until the session is restarted).
 *    The Shell resource is registered manually inside libshell-*.so, so it can
 *    NOT be loaded from a plain gjs process - this is checked statically.
 *
 * 2. prefs.js must NOT import the Shell resource; the prefs process only has
 *    the app's resources.  Shared code lives in common.js.  Checked for real:
 *    prefs.js is imported in a process that only registered the app's
 *    resources.
 *
 *   make test-imports        (adds the Shell typelib path needed by Shew)
 *
 * SPDX-License-Identifier: MIT
 */
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';

const SHELL_EXT = 'resource:///org/gnome/shell/extensions/extension.js';
const APP_EXT = 'resource:///org/gnome/Shell/Extensions/js/extensions/extension.js';

let failures = 0;

/* ---- 1. static check of the module import paths ----------------------- */
const SRC = {
    'extension/extension.js': true,   // shell side: must use the Shell resource
    'extension/prefs.js': false,      // prefs side: must NOT
    'extension/common.js': false,
};
for (const [f, shellSide] of Object.entries(SRC)) {
    let text;
    try {
        const [ok, bytes] = GLib.file_get_contents(f);
        if (!ok) throw new Error('missing');
        text = new TextDecoder().decode(bytes);
    } catch (e) {
        failures++;
        print(`FAIL cannot read ${f}`);
        continue;
    }
    if (shellSide && !text.includes(SHELL_EXT)) {
        failures++;
        print(`FAIL ${f}: must import ${SHELL_EXT}`);
    }
    if (!shellSide && text.includes(APP_EXT)) {
        failures++;
        print(`FAIL ${f}: must not import the app-only upper-case path`);
    }
}
if (!failures)
    print('OK   static import paths');

/* ---- 2. really import prefs.js with only the app resources ------------ */
const APP_RES = [
    '/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource',
    '/usr/share/gnome-shell/org.gnome.Extensions.src.gresource',
];
let registered = 0;
for (const r of APP_RES) {
    if (!Gio.File.new_for_path(r).query_exists(null))
        continue;
    try {
        Gio.resources_register(Gio.Resource.load(r));
        registered++;
    } catch (e) {
        print(`skip ${r}: ${e.message}`);
    }
}

if (!registered)
    print('SKIP import test: no Extensions app resources found');

for (const m of (ARGV.length ? ARGV : ['extension/prefs.js'])) {
    const url = Gio.File.new_for_path(m).get_uri();
    try {
        const mod = await import(url);
        print(`OK   ${m} imported (default export = ${typeof mod.default})`);
    } catch (e) {
        failures++;
        print(`FAIL ${m}: ${e.message}`);
        if (String(e.message).includes('Shew'))
            print('HINT: run with the Shell typelibs on the path:\n' +
                  '  GI_TYPELIB_PATH=/usr/lib/gnome-shell/girepository-1.0 ' +
                  'LD_LIBRARY_PATH=/usr/lib/gnome-shell gjs -m tests/prefs-import-test.mjs');
    }
}

print(failures ? 'IMPORT TEST FAILED' : 'IMPORT TEST OK');
System.exit(failures ? 1 : 0);
