/* Regression test for a real bug: the prefs process only has the Extensions
 * app's resources registered, so if prefs.js (transitively) imports the
 * Shell-only resource
 *   resource:///org/gnome/Shell/Extensions/js/extensions/extension.js
 * the settings dialog dies with
 *   ImportError: Unable to load file from: .../extensions/extension.js
 *
 *   gjs -m tests/prefs-import-test.mjs [extension/prefs.js]
 *
 * SPDX-License-Identifier: MIT
 */
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';

/* the settings dialog runs with the Shell's private typelibs on the path */
for (const dir of ['/usr/lib/gnome-shell/girepository-1.0', '/usr/lib64/gnome-shell/girepository-1.0']) {
    if (!GLib.file_test(dir, GLib.FileTest.IS_DIR))
        continue;
    const cur = GLib.getenv('GI_TYPELIB_PATH');
    if (!cur || !cur.includes(dir))
        GLib.setenv('GI_TYPELIB_PATH', cur ? `${cur}:${dir}` : dir, true);
    const lib = GLib.getenv('LD_LIBRARY_PATH');
    if (!lib || !lib.includes('/usr/lib/gnome-shell'))
        GLib.setenv('LD_LIBRARY_PATH', lib ? `${lib}:/usr/lib/gnome-shell` : '/usr/lib/gnome-shell', true);
    break;
}

const candidates = [
    '/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource',
    '/usr/lib/gnome-shell/org.gnome.Shell.Extensions.src.gresource',
    '/usr/share/gnome-shell/org.gnome.Extensions.src.gresource',
];

let registered = false;
for (const c of candidates) {
    if (!Gio.File.new_for_path(c).query_exists(null))
        continue;
    try {
        Gio.resources_register(Gio.Resource.load(c));
        print(`registered: ${c}`);
        registered = true;
        break;
    } catch (e) {
        print(`failed to register ${c}: ${e.message}`);
    }
}
if (!registered) {
    print('SKIP: Extensions app resource not found (not a GNOME machine?)');
    System.exit(0);
}

const url = Gio.File.new_for_path(
    ARGV[0] || 'extension/prefs.js').get_uri();

try {
    const mod = await import(url);
    print(`OK: ${url} imported, default export = ${typeof mod.default}`);
    System.exit(0);
} catch (e) {
    print(`FAILED: ${e.message}`);
    if (String(e.message).includes('Shew'))
        print('HINT: 需要在 Shell 的私有 typelib 路径下运行：\n' +
              '  GI_TYPELIB_PATH=/usr/lib/gnome-shell/girepository-1.0 \\\n' +
              '  LD_LIBRARY_PATH=/usr/lib/gnome-shell gjs -m tests/prefs-import-test.mjs\n' +
              '  （或直接 make test-prefs）');
    System.exit(1);
}
