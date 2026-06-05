# Escrite - 极简 Markdown 实时渲染编辑器

**Escrite** 是一款基于 Tauri v2、Svelte 5 与 TypeScript 构建的轻量级、高性能桌面级 Markdown 编辑器。专注于流畅的排版写作体验与优雅的所见即所得交互。

---

## 🌟 核心功能

*   **即时渲染 (Live Preview)**：
    *   **基础标记折叠**：支持粗体、斜体、行内代码的物理保留式隐藏，确保光标定位精确不漂移。
    *   **交互式任务列表**：实时渲染任务列表复选框，直接点击复选框即可动态更改底层 Markdown 文档。
    *   **多源图片支持**：智能解析本地绝对/相对图片路径，转换为 Tauri 安全资源链接渲染，支持多行 HTML 图片块 (`HTMLBlock`) 的安全折叠。
*   **GFM (GitHub Flavored Markdown) 扩展支持**：
    *   **排版表格 (Tables)**：完美支持标准 GFM 表格，在非编辑态下自动转换为高保真 HTML 表格，具备自适应列对齐、边框以及明暗交替行底色。
    *   **删除线与链接折叠**：支持双波浪号 (`~~strikethrough~~`) 实时删除线渲染；链接自动折叠并隐藏冗余括号与 URL 地址。
    *   **完整标题覆盖 (H1-H6)**：针对一级到六级标题进行了字号微调与自适应比率适配，呈现极佳的段落层次结构。
*   **LaTeX 数学公式渲染 (KaTeX)**：
    *   **单行与行内公式**：智能识别单行公式，采用与行内数学公式完全一致的无边框扁平设计，与正文文字无缝贴合。
    *   **多行块级公式 (Typora-Style)**：
        *   **阅读模式**：光标移开时自动收起，以完美的居中虚线卡片形式渲染公式。
        *   **编辑模式**：光标位于公式所在的任意行时，保留多行 LaTeX 源码显示便于修改，同时在公式正下方追加实时渲染预览，带来完美的双向交互反馈。
*   **Mermaid 流程图动态绘制**：
    *   支持标准的 Mermaid 语法（流程图、时序图、甘特图等），支持在阅读模式下转换为矢量图形，并完美适配明亮/暗黑主题配色。
*   **三种编辑模式一键切换**：
    *   **即时渲染模式**：所见即所得的高保真富文本书写体验。
    *   **源码模式**：关闭预览，还原纯文本纯净写作。
    *   **Vim 模拟模式**：开启 Vim 快捷键与行号显示，享受全键盘高效操作。
*   **优雅的 UI/UX 设计**：
    *   **顶层未保存指示**：文件名修改状态 `*` 动态显示在原生窗口标题栏中，防止用户关闭时误丢数据。
    *   **极简状态栏**：参考 Typora 极简设计，去除了多余的文件名视觉冗余，仅保留当前编辑模式（如 `STANDARD`/`NORMAL` 等）与字数/字符数及光标行列统计。
    *   **GitHub 风格配色**：明暗双主题配色均深度参考 GitHub Primer 规范。

---

## 🔒 安全性设计 (Defense in Depth)

本应用在前端渲染层与 Rust 后端执行层部署了严密的安全防范机制：

1.  **严格的 CSP 策略**：
    在 `tauri.conf.json` 中配置了严格的 Content Security Policy，阻断任意远程非授权 JS 脚本的执行与外发：
    ```json
    "security": {
      "csp": "default-src 'self'; img-src 'self' asset: https: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self';"
    }
    ```
2.  **Mermaid 安全沙箱**：
    将 Mermaid 初始化配置的安全级别强制设置为 `securityLevel: 'strict'`，阻止攻击者通过在图表节点标签（Labels）中嵌入恶意 HTML 标记或绑定的点击回调事件执行恶意脚本（防 XSS 攻击）。
3.  **Rust 后端路径穿越拦截 (Path Traversal Protection)**：
    在原生读取/保存文件命令（`read_md_file` / `save_md_file`）的前端入口部署了严格的路径检查机制：
    -   **格式约束**：仅允许读写扩展名为 `.md` 和 `.markdown` 的文件。
    -   **系统目录隔离**：拒绝访问系统敏感文件夹（如 Windows 安装根目录、`/etc` 等绝对路径），保护系统文件安全，同时通过了排除局部相对路径的精细化匹配，避免对普通工作目录的误判。
    -   **目录写入防范**：通过 Rust 标准库检测目标是否为目录（`path.is_dir()`），阻断向文件夹的越界操作。

---

## 🛠️ 技术选型与架构

1.  **核心壳容器**：[Tauri v2](https://tauri.app/) (Rust 驱动，极小的安装包体积与极低内存开销)。
2.  **前端框架**：[Svelte 5](https://svelte.dev/) + SvelteKit + TypeScript (无虚拟 DOM 的极致运行性能)。
3.  **编辑器引擎**：[CodeMirror 6](https://codemirror.net/) (现代模块化文本编辑器)。
4.  **公式渲染引擎**：[KaTeX](https://katex.org/) (当前互联网最快的数学公式渲染库)。
5.  **图表渲染引擎**：[Mermaid](https://mermaid.js.org/) (功能强大的图表及流程图生成引擎)。

### 关键优化设计
*   **逐行局部折叠技术 (Line-by-Line Folding)**：CodeMirror 6 中通过 `ViewPlugin` 渲染修饰器时，若 `replace` 跨越换行符 `\n` 会触发致命的崩溃报错。本项目独创了“逐行局部折叠 + CSS 样式隐藏”的折叠策略，完全规避了这一机制限制，同时免去了复杂的 B-Tree 状态维护开销。
*   **无 block: true 策略**：去除了所有可能引起插件层与编辑状态层冲突的 `block: true` 限制，直接利用 CSS `display: flex; width: 100%` 让浏览器层原生完成块级卡片布局排版，稳定性大幅提高。

---

## 🚀 快速开始

### 前置要求
*   Node.js (v18+)
*   Rust 编译环境 (Cargo)

### 安装依赖
```bash
npm install
```

### 开发调试
运行以下指令在 Tauri 开发沙盒中启动编辑器：
```bash
npm run tauri dev
```

### 静态检查
进行 TypeScript 与 Svelte 模板的静态诊断：
```bash
npm run check
```

### 后端单元测试
运行 Rust 后端集成测试与路径安全机制断言：
```cmd
cd src-tauri
cargo test
```

### 构建打包
```bash
npm run tauri build
```
