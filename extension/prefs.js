/* gascroll — preferences UI (GNOME 45+). SPDX-License-Identifier: MIT */
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {
    readConf, writeConf, shimLoaded, hookInstalled, installHook, removeHook,
    LIB_PATH, CONF_PATH, RESTART_NOTE,
} from './extension.js';

export default class GascrollPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const o = readConf();
        const page = new Adw.PreferencesPage({title: '滚动速度', icon_name: 'input-touchpad-symbolic'});
        window.add(page);

        const g1 = new Adw.PreferencesGroup({
            title: '触控板滚动速度',
            description: '全局生效（Chrome / 微信 / 钉钉 / IDEA / GTK 应用都受影响）。' +
                         '倍率改动 1 秒内生效，无需注销。',
        });
        page.add(g1);

        const sw = new Adw.SwitchRow({title: '启用缩放', active: !!o.enabled});
        g1.add(sw);

        const adj = new Gtk.Adjustment({
            lower: 0.05, upper: 1.0, step_increment: 0.01, page_increment: 0.05, value: o.factor,
        });
        const spin = new Adw.SpinRow({
            title: '倍率',
            subtitle: '1.00 = 原始速度；越小越慢（0.27 ≈ 原来的 1/4）',
            digits: 2, adjustment: adj,
        });
        g1.add(spin);

        const status = new Adw.ActionRow({title: '状态'});
        g1.add(status);
        const refreshStatus = () => {
            const loaded = shimLoaded();
            status.subtitle = loaded
                ? '✓ 缩放库已注入当前会话，倍率实时生效'
                : (hookInstalled()
                    ? '⚠ 已安装但未注入：注销重登一次生效'
                    : '✗ 未安装：点下面的"安装 / 更新注入"');
        };

        const presets = new Adw.ActionRow({title: '快速预设'});
        const box = new Gtk.Box({spacing: 6, valign: Gtk.Align.CENTER});
        for (const v of [1.0, 0.5, 0.35, 0.30, 0.27, 0.22, 0.15]) {
            const b = new Gtk.Button({label: v.toFixed(2), valign: Gtk.Align.CENTER});
            b.connect('clicked', () => { spin.value = v; });
            box.append(b);
        }
        presets.add_suffix(box);
        g1.add(presets);

        const g2 = new Adw.PreferencesGroup({title: '注入（高级）', description: RESTART_NOTE});
        page.add(g2);

        const installRow = new Adw.ActionRow({
            title: '安装 / 更新注入',
            subtitle: `编译并安装 ${LIB_PATH}，并为 gnome-shell 设置 LD_PRELOAD`,
        });
        const bInstall = new Gtk.Button({label: '安装', valign: Gtk.Align.CENTER});
        bInstall.connect('clicked', () => {
            const r = installHook(this.path || '');
            installRow.subtitle = r.ok ? '✓ 已安装（注销重登一次生效）' : `✗ ${r.err}`;
            refreshStatus();
        });
        installRow.add_suffix(bInstall);
        g2.add(installRow);

        const removeRow = new Adw.ActionRow({title: '移除注入', subtitle: '删除 LD_PRELOAD 配置（注销后彻底卸载）'});
        const bRemove = new Gtk.Button({label: '移除', valign: Gtk.Align.CENTER});
        bRemove.connect('clicked', () => {
            removeHook();
            removeRow.subtitle = '✓ 已移除，注销后彻底卸载';
            refreshStatus();
        });
        removeRow.add_suffix(bRemove);
        g2.add(removeRow);

        const devRow = new Adw.EntryRow({title: '只对名字含此字样的设备生效', text: o.device});
        g2.add(devRow);

        g2.add(new Adw.ActionRow({title: '配置文件', subtitle: CONF_PATH, activatable: false}));

        const save = () => {
            writeConf({enabled: sw.active ? 1 : 0, factor: spin.value, device: devRow.text.trim()});
            refreshStatus();
        };
        sw.connect('notify::active', save);
        spin.connect('notify::value', save);
        devRow.connect('changed', save);
        refreshStatus();
    }
}
