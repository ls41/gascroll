# Chrome 扩展 / Chrome extension (gascroll)

**只作用于 Chrome，按倍率降低网页滚动量**，与系统级的 `gascroll` 注入互不影响，可单独开关。

**Chrome-only extra damping.** It drops a fraction of `wheel` events, so every event that *is*
forwarded stays a genuine native event — no synthetic scrolling, no broken pages.

---

## 安装 / Install（30 秒）

1. `chrome://extensions` → 打开右上角 **开发者模式 / Developer mode**
2. **加载已解压的扩展程序 / Load unpacked** → 选择本目录
3. 点工具栏扩展图标 → 填倍率 → 立即生效（已打开的标签页按 `Ctrl+Shift+R` 刷新一次）

> **Flatpak Chrome 注意**：沙箱只挂载了 `~/Downloads`、`~/Documents`、`~/Music`、`~/Pictures`、`~/Videos`，
> 把本目录**复制到这些位置之一**（例如 `~/Downloads/gascroll-chrome-ext`）再加载，否则文件选择器里看不到 `~/.local/share` 之类的路径。
> Flatpak Chrome: copy this folder into one of those shared dirs first.

## 倍率 / Multiplier

| 值 | 含义 |
|---|---|
| `1.00` | 不额外降速（等于没装） |
| `0.50` | 滚一半（配合系统层 `factor≈0.27` 时的常用值） |
| `0.15` | 很慢 |

点扩展图标即可改，数字存 `chrome.storage.sync`，**即时生效、随时可删**。

## 原理 / How it works

`scale.js` 在每个页面（含 iframe）捕获 `wheel`：

- 维护一个"信用额度"：每来一个事件累加 `delta × mult`
- 额度够了 → **放行**（原生事件，网站与浏览器行为完全不变）
- 不够 → `preventDefault()` + `stopImmediatePropagation()` **丢弃**

因此期望通过率 = `mult`，滚动量按比例下降，且**不会自己滚动元素**，不会破坏虚拟滚动/地图类站点。
`Ctrl`/`Meta` 按下（缩放/系统手势）与 `deltaMode != 0`（按行/按页的滚轮）一律不干预。
