# AGENTS.md — how an AI agent should operate this repository

> Purpose: let a coding agent install, verify, tune, debug and uninstall **gascroll** on a
> GNOME/Wayland machine without a human in the loop. Everything below was verified on
> Ubuntu 26.04 / GNOME Shell 50.1 / Wayland / libinput 1.31.1 (2026-09).
> A short 中文速查 is at the bottom.

## 1. What this project is

A Wayland compositor hands the **same** scroll delta to every client, but each toolkit applies
its own factor (GTK ≈ ×1, Chromium ≈ ×12, WebKit/Java their own). GNOME has no scroll-speed
setting, so the only common choke point is where the compositor reads libinput. Therefore:

- `src/gascroll.c` → an `LD_PRELOAD` library that hooks the libinput scroll getters and
  multiplies the value by `factor` **for touchpads only**.
- It is injected into **gnome-shell** (mutter reads libinput in-process) via a systemd drop-in.
- The GNOME extension is only a **settings UI + self-installer**; a Shell extension alone can
  never change application scrolling on Wayland (scroll bypasses the Shell).
- `chrome-extension/` is an optional Chrome-only extra damper.

## 2. TL;DR recipe

```bash
git clone https://github.com/ls41/gascroll && cd gascroll
command -v gcc || sudo apt install -y gcc
./install.sh --factor 0.27          # builds lib, writes drop-in, installs + enables the extension
# >>> tell the user to log out and back in once <<<
gascroll status                     # after re-login: "已注入当前会话"
gascroll set 0.22                   # live tuning, no re-login ever again
```

## 3. Repo map

| path | role |
|---|---|
| `src/gascroll.c` | the LD_PRELOAD library (hooks `libinput_event_pointer_get_scroll_value[_v120]`, `get_axis_value`) |
| `extension/extension.js` | Shell-side module (imports the Shell base class) |
| `extension/common.js` | shared helpers — **must stay free of Shell-only imports** |
| `extension/prefs.js` | GTK4/libadwaita settings dialog |
| `extension/shim/gascroll.c` | copy of `src/gascroll.c` placed at install time, so the prefs dialog can rebuild the injection itself |
| `bin/gascroll` | CLI: `set|get|status|on|off` |
| `chrome-extension/` | optional Chrome damper (see its README) |
| `install.sh`, `uninstall.sh`, `Makefile` | install/uninstall/build; `make test`, `make test-imports` |

Installed artifacts (all under `$HOME`, no root needed):

```
~/.local/lib/libgascroll.so                                     the library
~/.config/gascroll.conf                                         enabled / factor / device
~/.config/systemd/user/org.gnome.Shell@.service.d/override.conf LD_PRELOAD + GASCROLL_CONF
~/.local/share/gnome-shell/extensions/gascroll@ga/              the extension
~/.local/bin/gascroll                                           CLI
```

## 4. Operations

### Install / repair
```bash
./install.sh [--factor 0.27] [--uuid gascroll@ga] [--no-extension]
```
It compiles with `gcc`, **atomically** replaces the library (`.tmp` + `mv` — gnome-shell may have
the old inode mapped, truncating it in place can SIGBUS the session), writes the drop-in, copies
the extension, and adds the uuid to `org.gnome.shell enabled-extensions`.

### Verify (in order)
```bash
grep -c libgascroll /proc/$(pgrep -x gnome-shell | head -1)/maps     # expect >= 1
journalctl -b | grep '\[gascroll\]' | tail -3                        # "[gascroll] enabled=1 factor=0.2700 device=Touchpad"
cat ~/.config/gascroll.conf
gdbus call --session --dest org.gnome.Shell.Extensions --object-path /org/gnome/Shell/Extensions \
  --method org.gnome.Shell.Extensions.GetExtensionInfo gascroll@ga   # 'state': 1.0 = ENABLED, 3.0 = ERROR
```
The journal line appears on the first scroll after a config change — that is the live-reload proof.

### Tune (never needs a re-login)
`gascroll set 0.25` — or write `factor=` in `~/.config/gascroll.conf` (re-read once per second).
Reference: `1.00` = untouched, `0.27` ≈ a quarter of the original speed.

### Uninstall
```bash
./uninstall.sh          # sets enabled=0, removes drop-in + extension
./uninstall.sh --purge  # also deletes the library and the config
```
Log out/in afterwards to unload the library from gnome-shell.

### Chrome extension (optional, per-browser)
`chrome://extensions` → Developer mode → Load unpacked → `chrome-extension/`.
**Flatpak Chrome**: the sandbox only mounts `~/Downloads`, `~/Documents`, `~/Music`, `~/Pictures`,
`~/Videos` (check `flatpak info --show-permissions com.google.Chrome`) — copy the folder into one
of them first, otherwise the file picker cannot see it.

## 5. Pitfalls (each one cost real debugging time)

1. **New extensions are only discovered at session start on Wayland.** `gnome-extensions install`,
   D-Bus `EnableExtension` and editing `enabled-extensions` all fail silently; the Shell never
   rescans the directory. A re-login is unavoidable.
2. **An extension that failed to load stays in state ERROR for the whole session**; disable/enable
   does not clear it (the failed module stays in the JS module cache). Verify with
   `GetExtensionInfo` (`state` 3.0) and re-login.
3. **Two different resource paths — different case, different provider:**
   - base class `Extension`: `resource:///org/gnome/**shell**/extensions/extension.js`
     (provided by `libshell-*.so`, manually registered → only usable *inside* gnome-shell;
     `Gio.Resource.load()` on that .so fails with `invalid gvdb header`).
   - prefs scaffolding: `resource:///org/gnome/**Shell**/Extensions/js/extensions/prefs.js`
     (provided by the Extensions app, available in the prefs process).
   Using the upper-case path for the base class makes the Shell fail to load the extension with
   `ImportError: Unable to load file from: .../extensions/extension.js (资源不存在)`, which the
   Extensions app then shows forever — while everything else (the injection, the prefs dialog)
   keeps working, which is very confusing. `make test-imports` guards both directions.
4. **Never import `extension.js` from `prefs.js`** (directly or transitively): the prefs process
   does not have the Shell resource. Put shared code in `common.js`.
5. **Never overwrite/delete a systemd drop-in directory wholesale.** Users may have unrelated
   drop-ins there (this machine once had `CPUAffinity` tuning). Write your own file name only, and
   only delete a legacy file after checking it mentions `libgascroll`.
6. **Do not do unrequested system tuning** (CPU pinning, power/scheduler, kernel parameters) — ask first.
7. `make test-imports` needs the Shell typelibs on the path:
   `GI_TYPELIB_PATH=/usr/lib/gnome-shell/girepository-1.0 LD_LIBRARY_PATH=/usr/lib/gnome-shell`
   (the Makefile target already does this; a Shew typelib error means the env is missing).
8. Measuring "how fast does app X scroll" needs instruments, not eyeballing: a probe page that
   logs `wheel` deltas + `window.scrollY` (deltaY **is** pixels in Chromium — verified with
   headless CDP) correlated against timestamped `libinput debug-events` output. Measured defaults
   on this machine: GTK-Wayland 7.1 px/unit, Chrome-Wayland 14.0, Chrome-Xwayland 11.5,
   Chrome + `WaylandUnscaledTouchpadScrolling` 1.0.
9. Chromium's own feature has **no usable middle gear**: `WaylandUnscaledTouchpadScrolling` is either
   off (×12) or on (raw), and its `scroll_scaling_factor` parameter does not exist in Chrome 154
   (identical results for 10 and 20). Chrome links libwayland **statically**, so a libwayland
   `LD_PRELOAD` shim cannot intercept it either.
10. `pkexec` may be passwordless on some machines; check before designing a flow that needs root.
    (Not needed by this project: everything runs as the user.)

## 6. Acceptance checklist

- [ ] `make test` prints `SELFTEST OK`
- [ ] `make test-imports` prints `IMPORT TEST OK`
- [ ] after re-login: `grep libgascroll /proc/<gnome-shell>/maps` matches
- [ ] `journalctl -b | grep [gascroll]` shows the current factor when scrolling
- [ ] extension `state` = 1 and the gear dialog opens with the slider at the configured factor
- [ ] changing `factor=` changes scrolling within ~1 s, without any re-login
- [ ] `./uninstall.sh` + re-login restores the original behaviour

---

## 中文速查

```bash
./install.sh --factor 0.27      # 安装（需 gcc）；之后注销重登一次
gascroll set 0.22               # 改倍率，1 秒内生效，永不再注销
gascroll status                 # 看配置 / 注入是否生效
./uninstall.sh                  # 卸载
make test && make test-imports  # 自检
```

四条最容易踩的坑：① Wayland 下新扩展必须重登才被发现；② 扩展一旦 ERROR，disable/enable 清不掉，也要重登；
③ 基类用小写 `org/gnome/shell/extensions/extension.js`，prefs 脚手架用大写 `org/gnome/Shell/Extensions/js/extensions/prefs.js`，混用会导致"扩展列表一直报 ImportError 但功能正常"；
④ 覆盖 `~/.local/lib/libgascroll.so` 必须 `.tmp`+`mv` 原子替换（shell 正映射旧 inode）。
