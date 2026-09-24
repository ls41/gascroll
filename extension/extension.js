/* gascroll — GNOME Shell side of the extension (runs inside gnome-shell).
 *
 * Everything shared with the settings dialog lives in common.js, because the
 * Shell-only resource this file imports from is *not* available in the prefs
 * process.  Do not import this file from prefs.js.
 *
 * SPDX-License-Identifier: MIT
 */
import GLib from 'gi://GLib';
import {Extension} from 'resource:///org/gnome/Shell/Extensions/js/extensions/extension.js';
import {CONF_PATH, DEFAULT_CONF, writeConf} from './common.js';

export default class GascrollExtension extends Extension {
    enable() {
        // make sure a config exists so the injected library has something to read
        try {
            if (!GLib.file_test(CONF_PATH, GLib.FileTest.EXISTS))
                writeConf(DEFAULT_CONF);
        } catch (e) {
            logError(e, 'gascroll: enable');
        }
    }

    disable() {}
}
