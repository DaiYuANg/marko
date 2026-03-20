# macOS 原生交通灯实现方案

## 问题

1. **需求**：macOS 上显示原生红黄绿交通灯，且与自定义 titlebar 同一行（不单独占一行）
2. **历史问题**：
   - `titleBarStyle: Overlay` + 纯配置：用户反馈仍独立占一行
   - `tauri-plugin-decorum`：在 setup 中调用导致 cocoa 空指针 panic

## 根因分析

### decorum 崩溃原因

- `set_traffic_lights_inset()` 在 **setup** 阶段被调用
- setup 执行时主窗口虽已创建，但 NSWindow/NSView 层级可能尚未就绪
- decorum 直接操作 `close.superview()`、`title_bar_container_view` 等，在未就绪时可能为 null
- cocoa 对 null 的解引用导致 panic

### 正确方向

1. **不依赖 decorum**：使用 Tauri 2.4+ 内置的 `trafficLightPosition`
2. **不修改已创建窗口**：通过配置在**创建时**指定，避免在 setup 中做窗口操作
3. **平台配置合并**：用 `tauri.macos.conf.json` 仅覆盖主窗口设置

## 实现方案

### 方案 A：纯配置（推荐先试）

- 新建 `tauri.macos.conf.json`，仅覆盖主窗口：
  - `decorations: true`
  - `titleBarStyle: "Overlay"`
  - `hiddenTitle: true`
  - `trafficLightPosition: { "x": 15, "y": 20 }`（若 Tauri 2.10 支持）
- 不引入 decorum，不在 setup 中做任何窗口相关调用
- Titlebar 增加 `pl-[72px]`，为交通灯留出左侧空间

**优点**：改动小、无 Rust 逻辑、无第三方插件
**缺点**：若配置合并或 Overlay 表现异常，可能仍出现单独一行

### 方案 B：主窗口改为 Rust 创建（方案 A 不足时）

- 在 `tauri.macos.conf.json` 中将主窗口设为 `"create": false`
- 在 setup 中用 `WebviewWindowBuilder::from_config()` 或等价方式创建主窗口
- 在创建时设置 `title_bar_style(Overlay)`、`traffic_light_position(...)`
- 保证窗口在创建完成后再做后续逻辑，避免过早访问 NSWindow

**优点**：创建时机可控，参数可精确设置
**缺点**：需处理 URL、visible 等创建逻辑，改动较大

### 方案 C：若仍出现单独一行

- 查阅 tao/wry 中 Overlay 的 content inset 行为
- 评估是否需用 `macOSPrivateApi` 或其它方式调整 content 布局
- 备选：接受无原生交通灯（`decorations: false`），用自定义 HTML 按钮模拟

## 建议步骤

1. 实施方案 A，验证是否能正常运行且布局符合预期
2. 若仍有单独一行，尝试调整 `trafficLightPosition.y` 及 titlebar 的 `pl-[72px]`
3. 若仍不足，再考虑方案 B 或方案 C
