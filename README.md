# gascroll — Linux 触控板滚动速度调节

> Wayland 上"浏览器/微信/钉钉/IDEA 滚得飞快、只有终端和系统设置正常"的终极解法。

一个仓库，三部分：

| 部分 | 作用 |
|---|---|
| `src/gascroll.c` | **核心**：LD_PRELOAD 库，hook libinput 的滚动取值 ×倍率（只在 gnome-shell/mutter 里生效） |
| `extension/` | GNOME Shell 扩展：滑块调倍率 + 一键安装/移除注入 |
| `chrome-extension/` | 可选：只给 Chrome 再单独降速（其他应用不受影响） |

## 为什么需要 LD_PRELOAD 而不是纯扩展？

- Wayland 下**合成器把同一份滚动量直接发给每个客户端**，Shell 扩展拿不到应用的滚动事件 → 纯扩展**机制上不可能**改滚动速度。
- 而各工具箱会把这份滚动量**自己再乘一个系数**：GTK ≈×1，**Chromium 系 ×12**（`ui/ozone/platform/wayland/host/wayland_event_source.cc`，`kAxisValueScale=10` → `delta/10*120`），WebKit / Java 各一套 → 这就是"只有 GTK 应用正常"的根因。
- GNOME **没有**任何滚动速度设置；libinput 的 quirks 没有滚动系数属性；Chromium 自带的 `WaylandUnscaledTouchpadScrolling` 开关只有"原始值"和"×12"两档，中间没有档位（实测该特性的 `scroll_scaling_factor` 参数在 Chrome 154 里不存在）。
- 所以在 libinput 出口处统一乘系数，是唯一能让**所有**工具箱一起变慢、且倍率连续可调的位置。

实测数据（px / libinput 轴单位，同一台机器同一块触控板）：

| 场景 | 滚动量 |
|---|---|
| GTK-Wayland（终端/设置/编辑器） | 7.1 |
| Chrome-Wayland（默认） | 14.0 |
| Chrome-Xwayland | 11.5 |
| Chrome + 官方开关 | 1.0 |

## 安装

```bash
git clone <this repo> && cd gascroll
./install.sh              # 需要 gcc
# 想直接指定初始倍率：./install.sh --factor 0.25
```

安装脚本会：编译并原子替换 `~/.local/lib/libgascroll.so` → 写 systemd drop-in
`~/.config/systemd/user/org.gnome.Shell@.service.d/override.conf` → 装好 GNOME 扩展并启用。

**然后注销重新登录一次**（两个原因：gnome-shell 只在启动时读 `LD_PRELOAD`；GNOME 在 Wayland 下只在会话开始时扫描新扩展）。
之后再调倍率**永远不用再注销**。

## 使用

- 图形界面：`扩展`(Extensions) → **Touchpad Scroll Speed** → 齿轮 → 拖滑块 / 点预设。
- 命令行 `gascroll set/get/status/on/off`（改文件即生效，1 秒内）：
  ```bash
  gascroll set 0.25      # 也可直接编辑 ~/.config/gascroll.conf
  ```
- 配置文件 `~/.config/gascroll.conf`：
  ```ini
  enabled=1
  factor=0.27        # 1.00 = 原始速度；越小越慢
  device=Touchpad    # 只对名字含该字样的设备生效（鼠标滚轮不受影响）
  ```

参考手感：`0.27` ≈ 原始速度的 1/4，是常见"舒服点"；`0.15` 很慢；`1.00` 等于没装。

## Chrome 单独降速（可选）

`chrome-extension/` 里的扩展按倍率**丢弃一部分 wheel 事件**（放行的都是原生事件，不自己滚动页面，因此不会破坏网页）：
`chrome://extensions` → 开发者模式 → 加载已解压的扩展程序 → 选该目录 → 点图标改倍率。

> Flatpak 版 Chrome 的沙箱只挂载了 `~/Downloads`、`~/Documents` 等少数目录，扩展目录要放在这些位置里（放 `~/.local/share` 会看不见）。

## 卸载

```bash
./uninstall.sh          # 移除注入与扩展（保留库和配置）
./uninstall.sh --purge  # 连库和配置一起删
```
注销重登后彻底卸载。

## 已知边界

- **"不跟手"的 X11 应用（钉钉/IDEA/GA 等）无法变顺滑**：它们经 Xwayland，工具包只认"一格一格的滚轮步进"，天生按格跳。本方案只能让它们变慢。
- 鼠标滚轮**不受影响**（只对 `device=` 匹配到的触控板生效）。
- 编译期依赖 `gcc`，运行期只依赖 glibc。
- 只有 gnome-shell/mutter 会加载这个库，其它程序完全不受影响。

## 许可

MIT，见 `LICENSE`。欢迎 issue / PR。
