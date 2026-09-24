# gascroll

**统一调节 Linux / GNOME Wayland 上触控板的双指滚动速度。**
一个仓库 = libinput 层缩放库 + GNOME 扩展（图形设置界面）+ 可选 Chrome 扩展。

`keywords: gnome wayland libinput mutter touchpad scroll-speed two-finger-scroll ld-preload gnome-shell-extension ubuntu linux chromium electron linux-desktop`

---

## 问题背景

在 GNOME/Wayland 上，**"浏览器、微信、钉钉、IDEA 滚得飞快，只有终端和系统设置正常"** 是预期行为，不是驱动坏了：

1. 合成器把**同一份**滚动量发给每个客户端，但**各工具箱自己再乘一个系数**：
   | 工具箱 | 自己乘的倍数 | 实测滚动量(px / libinput 单位) |
   |---|---|---|
   | GTK（终端 / 系统设置 / 文本编辑器） | ≈×1 | 7.1 |
   | Chromium 系（Chrome / 微信 / 钉钉 / VS Code） | **×12** | 14.0 |
   | WebKit / Java（Tauri、IDEA） | 各自一套 | — |
   Chromium 的 ×12 出自 `ui/ozone/platform/wayland/host/wayland_event_source.cc`（`kAxisValueScale = 10` → `delta / 10 * 120`）。
2. GNOME **没有任何滚动速度设置**；libinput 的 quirks 也没有滚动系数属性；Chromium 自带的 `WaylandUnscaledTouchpadScrolling` 只有"原始值 / ×12"两档，中间无档位。

## 改造思路

既然各工具箱都在"出口处"自己乘系数，就在**唯一共同的上游**——合成器读取 libinput 的位置——统一乘一个系数：

- `src/gascroll.c`：一个 LD_PRELOAD 库，hook `libinput_event_pointer_get_scroll_value[_v120]` 等取值函数，把**触控板**的滚动量乘以 `factor`（鼠标滚轮不受影响）
- 通过 systemd 的 `org.gnome.Shell@.service` drop-in 注入 gnome-shell（mutter 就在这个进程里读 libinput）
- **为什么不能只写一个 GNOME 扩展**：Wayland 下合成器直接把滚动事件发给客户端，Shell 扩展根本看不到应用的滚动，纯扩展**机制上**改不了速度；扩展只能做设置界面
- 配置文件每秒重读 → **改倍率立即生效，不用注销**；只有首次安装/移除注入需要重登一次

## 使用方法

```bash
git clone https://github.com/ls41/gascroll && cd gascroll
./install.sh              # 需要 gcc；可选 ./install.sh --factor 0.25
# 然后注销重新登录一次（首次注入 + GNOME 在 Wayland 下只在会话开始时扫描新扩展）
```

装好后四种调法，任选：

| 方式 | 操作 |
|---|---|
| 图形界面 | `扩展` → **Touchpad Scroll Speed** → 齿轮 → 拖滑块 / 点预设 |
| 命令行 | `gascroll set 0.27`（`get` / `status` / `on` / `off`） |
| 配置文件 | 编辑 `~/.config/gascroll.conf` 的 `factor=` |
| Chrome 单独降速 | `chrome-extension/` 按倍率丢弃部分 wheel 事件 |

```ini
# ~/.config/gascroll.conf
enabled=1
factor=0.27        # 1.00=原始速度；越小越慢（0.27 ≈ 原来的 1/4，常见舒适值）
device=Touchpad    # 只对名字含该字样的设备生效；留空=所有设备
```

卸载：`./uninstall.sh`（或 `--purge` 连库和配置一起删）。

## Chrome 扩展（可选，只影响浏览器）

`chrome-extension/` 是一个 MV3 扩展，按倍率**丢弃一部分 `wheel` 事件**——放行的都是原生事件，
不自己滚动元素，所以不会破坏虚拟滚动/地图类网站。适合"系统层已经调好、但还想让浏览器再慢一点"的情况。

1. `chrome://extensions` → 打开 **开发者模式**
2. **加载已解压的扩展程序** → 选 `chrome-extension/` 目录
3. 点扩展图标填倍率（`1.00`=不降速，`0.50`=滚一半）→ 立即生效，已开标签页按 `Ctrl+Shift+R` 刷新一次

> **Flatpak 版 Chrome**：沙箱只挂载 `~/Downloads`、`~/Documents`、`~/Music`、`~/Pictures`、`~/Videos`，
> 先把这个目录复制到其中之一再加载（详见 `chrome-extension/README.md`）。

## 给 AI agent 的操作指引

仓库根目录的 **`AGENTS.md`** 写给自动化/agent 看：安装、验证、调参、排障、验收清单，
以及那些"踩过一次就再也不想踩"的坑（Wayland 下新扩展必须重登、两个资源路径的大小写、原子替换库文件等）。

## 注意 / 边界

- **"不跟手"的 X11 应用（钉钉 / IDEA 等）无法变顺滑**：它们经 Xwayland，工具包只认离散滚轮步进，天生按格跳；本方案只能让它们变慢。
- 鼠标滚轮不受影响（只匹配 `device=` 的触控板）。
- 注入只在 gnome-shell 进程内生效，其它程序完全不受影响；任何异常都退化为"原始值"。
- 实测环境：Ubuntu 26.04 / GNOME Shell 50.1 / Wayland / libinput 1.31.1。

---

# English

**Uniformly adjust the touchpad two-finger scroll speed on Linux / GNOME Wayland.**
One repo = a libinput-level scaling library + a GNOME Shell extension (GUI) + an optional Chrome extension.

## Problem

On GNOME/Wayland, *"the browser, WeChat, DingTalk and my IDE scroll way too fast while the terminal and GNOME Settings feel fine"* is expected behaviour, not a driver bug:

1. The compositor delivers **one and the same** scroll delta to every client, but **each toolkit multiplies it by its own factor**:
   | toolkit | factor | measured scroll (px per libinput unit) |
   |---|---|---|
   | GTK (terminal, Settings, text editor) | ≈×1 | 7.1 |
   | Chromium family (Chrome, WeChat, DingTalk, VS Code) | **×12** | 14.0 |
   | WebKit / Java (Tauri apps, IDEA) | their own | — |
   Chromium's ×12 comes from `ui/ozone/platform/wayland/host/wayland_event_source.cc` (`kAxisValueScale = 10` → `delta / 10 * 120`).
2. GNOME has **no scroll-speed setting**, libinput quirks have no scroll factor, and Chromium's own `WaylandUnscaledTouchpadScrolling` feature only offers "raw" or "×12" — nothing in between.

## How it works

Every toolkit applies its factor at the consumer side, so the fix is to scale the value at the **single common point upstream**: where the compositor reads libinput.

- `src/gascroll.c` — an `LD_PRELOAD` library that hooks `libinput_event_pointer_get_scroll_value[_v120]` (and the legacy getter) and multiplies the value by `factor` — **only for touchpads**, so a real mouse wheel keeps its speed.
- It is injected into gnome-shell through a systemd drop-in for `org.gnome.Shell@.service` (mutter reads libinput in that process).
- **Why a Shell extension alone cannot do it**: on Wayland the compositor hands scroll events straight to the clients, so an extension never sees application scrolling.
- The config file is re-read once per second, so **changing the factor applies immediately without logging out**; only the first install (or removal) of the injection needs a re-login.

## Usage

```bash
git clone https://github.com/ls41/gascroll && cd gascroll
./install.sh              # needs gcc; optional: ./install.sh --factor 0.25
# then log out and back in once (LD_PRELOAD + GNOME only scans new extensions at session start)
```

| how | what |
|---|---|
| GUI | *Extensions* → **Touchpad Scroll Speed** → gear icon → slider / presets |
| CLI | `gascroll set 0.27` (`get` / `status` / `on` / `off`) |
| config | edit `factor=` in `~/.config/gascroll.conf` |
| Chrome only | `chrome-extension/` drops a fraction of wheel events |

Uninstall with `./uninstall.sh` (or `--purge`).

## Chrome extension (optional, browser-only)

`chrome-extension/` is a small MV3 extension that **drops a fraction of `wheel` events**; every
event that is forwarded stays a native event (nothing scrolls programmatically), so virtualised
lists and map-like sites keep working. Useful when the global factor is already right but you want
the browser a bit slower still.

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → pick the `chrome-extension/` folder
3. Click the toolbar icon and set the multiplier (`1.00` = untouched, `0.50` = half) — takes effect
   immediately; reload already-open tabs once with `Ctrl+Shift+R`

> **Flatpak Chrome**: the sandbox only mounts `~/Downloads`, `~/Documents`, `~/Music`, `~/Pictures`,
> `~/Videos` — copy the folder into one of those first (details in `chrome-extension/README.md`).

## For AI agents

**`AGENTS.md`** in the repo root is written for automation/agents: install, verify, tune,
troubleshoot and an acceptance checklist — plus the pitfalls worth never hitting twice
(Wayland only discovers new extensions at session start, the two case-different resource paths,
atomic replacement of the library while gnome-shell has it mapped, …).

## Notes / limits

- **X11 apps that feel "not 1:1" (DingTalk, IDEA, …) cannot be made smooth**: they go through Xwayland and their toolkits only understand discrete wheel steps. This project can only make them slower.
- Mouse wheels are untouched; only devices matching `device=` are scaled.
- The hook lives inside gnome-shell only; every failure path returns the untouched value.
- Tested on: Ubuntu 26.04 / GNOME Shell 50.1 / Wayland / libinput 1.31.1.

## License

MIT
