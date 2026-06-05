<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorState } from '@codemirror/state';
  import { EditorView, keymap, lineNumbers } from '@codemirror/view'; // lineNumbers 在 Vim 模式下启用
  import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
  import { vim, getCM, Vim } from '@replit/codemirror-vim';
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
  import { createLivePreviewExtension } from './editor/livePreview';
  import '@fontsource/open-sans/400.css';     // Open Sans 常规字重（Typora 默认正文）
  import '@fontsource/open-sans/400-italic.css';
  import '@fontsource/open-sans/600.css';     // 半粗（用于标题）
  import '@fontsource/open-sans/700.css';     // 粗体
  import 'katex/dist/katex.min.css';

  export let fileContent: string = "";
  export let enableVim: boolean = false;
  export let isDarkMode: boolean = true;
  export let filePath: string = "";
  export let enableLivePreview: boolean = true;
  export let onSave: () => void = () => {};

  let editorContainer: HTMLDivElement;
  let view: EditorView;

  /**
   * Inserts the given text at the current cursor position or selection range.
   * Automatically focuses the editor and scrolls the cursor into view.
   *
   * @param {string} text - The markdown text to be inserted into the document.
   * @returns {void}
   */
  export function insertText(text: string): void {
    if (view) {
      const transaction = view.state.update({
        changes: {
          from: view.state.selection.main.from,
          to: view.state.selection.main.to,
          insert: text
        },
        selection: { anchor: view.state.selection.main.from + text.length },
        scrollIntoView: true
      });
      view.dispatch(transaction);
      view.focus();
    }
  }

  // 状态栏变量
  let vimMode: string = "NORMAL";
  let cursorLine: number = 1;
  let cursorCol: number = 1;
  let wordCount: number = 0;
  let charCount: number = 0;



  function handleVimModeChange(data: any) {
    if (data && data.mode) {
      vimMode = data.mode.toUpperCase();
    }
  }

  // 监听外部文件内容变化（比如打开新文件或清空内容时）
  $: if (view && fileContent !== undefined) {
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== fileContent) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: fileContent }
      });
    }
  }

  onMount(() => {
    // 初始化字数统计
    const initialText = fileContent || "";
    charCount = initialText.length;
    wordCount = initialText.trim() ? initialText.trim().split(/\s+/).length : 0;

    // 1. 动态构建 CodeMirror 的扩展插件列表
    const extensions = [
      markdown({ base: markdownLanguage }),              // Markdown 语法高亮 (启用 GFM)
      EditorView.lineWrapping, // 自动换行
      history(),               // 启用撤销/重做历史记录
      keymap.of([...defaultKeymap, ...historyKeymap]),  // 按键与历史按键映射
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          // 实时将编辑器的内容同步到外部绑定变量中
          fileContent = update.state.doc.toString();
        }

        // 实时更新字数与光标行列位置
        if (update.selectionSet || update.docChanged) {
          const state = update.state;
          const pos = state.selection.main.head;
          const line = state.doc.lineAt(pos);
          cursorLine = line.number;
          cursorCol = pos - line.from + 1;
          
          const text = state.doc.toString();
          charCount = text.length;
          wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
        }
      })
    ];

    // 如果启用了即时渲染 (Live Preview)
    if (enableLivePreview) {
      extensions.push(createLivePreviewExtension(filePath));
    }

    // 如果启用了 Vim 模式，则同时加载 Vim 模拟器和行号显示
    if (enableVim) {
      extensions.push(vim());
      extensions.push(lineNumbers()); // Vim 模式下显示行号，方便行跳转操作
    }

    // 动态应用自定义主题样式 —— 对齐 Typora 阅读体验 + GitHub 配色
    const customTheme = EditorView.theme({
      "&": {
        height: "100%",
        fontSize: "16px",
        fontFamily: "'Open Sans', 'Clear Sans', 'Helvetica Neue', Helvetica, Arial, 'Segoe UI Emoji', 'PingFang SC', 'Microsoft YaHei', '微软雅黑', 'Microsoft JhengHei', sans-serif",
        backgroundColor: isDarkMode ? "#0d1117" : "#ffffff",
        color: isDarkMode ? "#e6edf3" : "#1f2328"
      },
      ".cm-scroller": {
        lineHeight: "1.7",      // Typora 风格的宽松行高，提升长文阅读舒适度
      },
      ".cm-content": {
        caretColor: isDarkMode ? "#e6edf3" : "#1f2328",
        padding: "32px 48px",   // 更宽裕的内边距，营造文档感
        maxWidth: "860px",      // 限制内容区最大宽度，避免长行难以阅读
        margin: "0 auto",       // 居中排版，类似 Typora 的居中效果
      },
      ".cm-line": {
        padding: "1px 0",       // 每行微小间距，模拟段间距感
      },
      ".cm-cursor": {
        borderLeftColor: isDarkMode ? "#e6edf3" : "#1f2328"
      },
      ".cm-gutters": {
        backgroundColor: isDarkMode ? "#0d1117" : "#ffffff",
        color: isDarkMode ? "#484f58" : "#636c76",
        border: "none",
        paddingRight: "10px"
      },
      ".cm-activeLineGutter": {
        backgroundColor: isDarkMode ? "#161b22" : "#f6f8fa"
      },
      ".cm-activeLine": {
        backgroundColor: isDarkMode ? "rgba(110,118,129,0.1)" : "rgba(234,238,242,0.5)"
      },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
        backgroundColor: isDarkMode ? "rgba(56,139,253,0.3)" : "rgba(84,174,255,0.2)"
      }
    }, { dark: isDarkMode });
    extensions.push(customTheme);

    // 2. 创建编辑器状态实例
    const startState = EditorState.create({
      doc: fileContent,
      extensions
    });

    // 3. 初始化并挂载编辑器视图
    view = new EditorView({
      state: startState,
      parent: editorContainer
    });

    // 绑定 Vim 模式切换事件
    if (enableVim) {
      const cm = getCM(view);
      if (cm) {
        cm.on('vim-mode-change', handleVimModeChange);
      }
      
      // 注册 :w / :write 命令来调用保存函数
      Vim.defineEx('write', 'w', () => {
        onSave();
      });
    }
  });

  onDestroy(() => {
    if (view) {
      if (enableVim) {
        try {
          const cm = getCM(view);
          if (cm) {
            cm.off('vim-mode-change', handleVimModeChange);
          }
        } catch (e) {
          // 忽略可能的注销异常
        }
      }
      view.destroy();
    }
  });
</script>

<div class="editor-container">
  <div class="editor-wrapper" bind:this={editorContainer}></div>
  
  <div class="status-bar">
    <div class="status-left">
      {#if enableVim}
        <span class="status-mode mode-{vimMode.toLowerCase()}">{vimMode}</span>
      {:else}
        <span class="status-mode mode-standard">STANDARD</span>
      {/if}
    </div>
    
    <div class="status-right">
      <span class="status-item">{wordCount} words</span>
      <span class="status-item">{charCount} chars</span>
      <span class="status-item">Ln {cursorLine}, Col {cursorCol}</span>
    </div>
  </div>
</div>

<style>
  /* ----------------------------------------------------
   * 1. 主题全局 CSS 变量定义区（明亮与暗黑模式均参考 GitHub 风格，进行颜色集中管理）
   * ---------------------------------------------------- */
  
  /* 明亮模式配置（精确对齐 GitHub Primer Light 配色） */
  :global(.theme-light) {
    --theme-bold-color: inherit;
    --theme-italic-color: inherit;
    
    /* 行内代码 — GitHub 不改变文字颜色，仅加浅灰底 */
    --theme-code-inline-bg: rgba(175, 184, 193, 0.2);
    --theme-code-inline-color: inherit;

    /* 代码块背景 */
    --theme-codeblock-bg: #f6f8fa;

    /* 数学公式 — 与代码块保持一致的视觉风格 */
    --theme-math-bg: #f6f8fa;
    --theme-math-color: inherit;
    --theme-math-border: #d0d7de;

    /* 标题下划线 — GitHub h1/h2 的经典底部分割线 */
    --theme-heading-border: #d0d7de;

    /* 引用块 */
    --theme-blockquote-border: #d0d7de;
    --theme-blockquote-color: #656d76;

    /* 分割线 */
    --theme-hr-color: hsla(210, 18%, 87%, 1);

    /* 任务列表复选框 */
    --theme-todo-border: #d0d7de;
    --theme-todo-checked-bg: #2da44e;
    --theme-todo-checked-border: #2da44e;

    /* 本地图片 */
    --theme-image-border: #d0d7de;

    /* 状态栏 */
    --status-bg: #f6f8fa;
    --status-color: #57606a;
    --status-border: #d0d7de;
    --status-mode-color: #ffffff;
  }

  /* 暗黑模式配置（精确对齐 GitHub Primer Dark 配色） */
  :global(.theme-dark) {
    --theme-bold-color: inherit;
    --theme-italic-color: inherit;
    
    /* 行内代码 — GitHub 暗黑模式同样不改变文字颜色 */
    --theme-code-inline-bg: rgba(110, 118, 129, 0.4);
    --theme-code-inline-color: inherit;

    /* 代码块背景 */
    --theme-codeblock-bg: #161b22;

    /* 数学公式 — 与代码块保持一致的视觉风格 */
    --theme-math-bg: #161b22;
    --theme-math-color: inherit;
    --theme-math-border: #30363d;

    /* 标题下划线 */
    --theme-heading-border: #21262d;

    /* 引用块 */
    --theme-blockquote-border: #3b434b;
    --theme-blockquote-color: #848d97;

    /* 分割线 */
    --theme-hr-color: #30363d;

    /* 任务列表复选框 */
    --theme-todo-border: #30363d;
    --theme-todo-checked-bg: #238636;
    --theme-todo-checked-border: #238636;

    /* 本地图片 */
    --theme-image-border: #30363d;

    /* 状态栏 */
    --status-bg: #161b22;
    --status-color: #848d97;
    --status-border: #30363d;
    --status-mode-color: #ffffff;
  }

  /* ----------------------------------------------------
   * 2. 布局与基本样式定义区（元素直接引用 CSS 变量）
   * ---------------------------------------------------- */
  .editor-container {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .editor-wrapper {
    flex: 1;
    width: 100%;
    overflow: hidden;
    outline: none;
  }
  
  /* 自定义 CodeMirror 高度铺满容器 */
  :global(.cm-editor) {
    height: 100%;
  }

  /* 即时渲染（Live Preview）样式 */
  :global(.cm-live-bold) {
    font-weight: bold;
    color: var(--theme-bold-color, inherit);
  }

  :global(.cm-live-italic) {
    font-style: italic;
    color: var(--theme-italic-color, inherit);
  }

  :global(.cm-live-h1) {
    font-size: 2em;
    font-weight: 600;
    line-height: 1.25;
    padding-top: 12px;
    padding-bottom: 6px;
    margin: 0;
    border-bottom: 1px solid var(--theme-heading-border, #d0d7de);
  }

  :global(.cm-live-h2) {
    font-size: 1.5em;
    font-weight: 600;
    line-height: 1.25;
    padding-top: 10px;
    padding-bottom: 5px;
    margin: 0;
    border-bottom: 1px solid var(--theme-heading-border, #d0d7de);
  }

  :global(.cm-live-h3) {
    font-size: 1.25em;
    font-weight: 600;
    line-height: 1.25;
    padding-top: 8px;
    padding-bottom: 4px;
    margin: 0;
  }

  /* 任务列表 Checkbox 样式 */
  :global(.cm-live-todo-checkbox) {
    appearance: none;
    -webkit-appearance: none;
    width: 15px;
    height: 15px;
    border: 1.5px solid var(--theme-todo-border);
    border-radius: 3px;
    outline: none;
    background-color: transparent;
    cursor: pointer;
    vertical-align: middle;
    margin-right: 8px;
    position: relative;
    transition: all 0.2s ease;
  }

  :global(.cm-live-todo-checkbox:checked) {
    background-color: var(--theme-todo-checked-bg);
    border-color: var(--theme-todo-checked-border);
  }

  :global(.cm-live-todo-checkbox:checked::after) {
    content: "";
    position: absolute;
    left: 4.5px;
    top: 1px;
    width: 4px;
    height: 8px;
    border: solid white;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }

  /* 图片即时渲染样式 — GitHub 扁平简洁风格 */
  :global(.cm-live-image-container) {
    display: flex;
    justify-content: center;
    margin: 16px 0;
    width: 100%;
  }

  :global(.cm-live-image) {
    max-width: 100%;
    max-height: 500px;
    border-style: none;
    box-sizing: content-box;
    background-color: transparent;
  }

  /* 数学公式（KaTeX LaTeX Math）块级真实渲染样式 — GitHub 风格 */
  :global(.cm-live-math-block) {
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: var(--theme-math-bg);
    color: var(--theme-math-color);
    padding: 16px;
    border-radius: 6px;
    border: 1px solid var(--theme-math-border);
    margin: 16px 0;
    font-size: 1.1em;
    overflow-x: auto;
  }

  /* 数学公式（KaTeX LaTeX Math）行内真实渲染样式 */
  :global(.cm-live-math-inline) {
    display: inline-block;
    color: var(--theme-math-color);
    padding: 0 4px;
    vertical-align: middle;
  }

  /* 物理保留式折叠：使折叠的 Markdown 标记在 DOM 树中占极微小位置，以保障光标/鼠标坐标定位极其精准 */
  :global(.cm-live-hidden) {
    display: inline-block !important;
    width: 0px !important;
    height: 0px !important;
    font-size: 0px !important;
    line-height: 0px !important;
    visibility: hidden !important;
    overflow: hidden !important;
    vertical-align: middle !important;
  }

  /* 隐藏多行公式折叠后的富余行容器，使高度塌陷为 0 */
  :global(.cm-live-hidden-line) {
    display: none !important;
  }

  /* 行内代码（Inline Code）— GitHub Primer 风格：不变色、浅底色、圆角胶囊 */
  :global(.cm-live-inline-code) {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
    font-size: 85%;
    padding: 0.2em 0.4em;
    border-radius: 6px;
    margin: 0;
    vertical-align: baseline;
    white-space: break-spaces;
    
    background-color: var(--theme-code-inline-bg) !important;
    color: var(--theme-code-inline-color) !important;
  }

  /* 状态栏样式 */
  .status-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 28px;
    padding: 0 12px;
    font-size: 12px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    user-select: none;
    border-top: 1px solid var(--status-border);
    background-color: var(--status-bg);
    color: var(--status-color);
  }

  .status-left, .status-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .status-mode {
    font-weight: bold;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 11px;
    letter-spacing: 0.5px;
    color: var(--status-mode-color);
  }

  .mode-normal {
    background-color: #2da44e;
  }

  .mode-insert {
    background-color: #cf222e;
  }

  .mode-visual {
    background-color: #8250df;
  }

  .mode-standard {
    background-color: #57606a;
  }

  .status-item {
    opacity: 0.85;
  }

  /* Mermaid 即时渲染样式 — GitHub 代码块风格 */
  :global(.cm-live-mermaid-container) {
    display: flex;
    justify-content: center;
    margin: 16px 0;
    width: 100%;
    background-color: var(--theme-codeblock-bg, #f6f8fa);
    border: 1px solid var(--theme-math-border, #d0d7de);
    border-radius: 6px;
    padding: 16px;
    box-sizing: border-box;
    overflow-x: auto;
  }

  :global(.cm-live-mermaid-error) {
    color: #cf222e;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    white-space: pre-wrap;
    font-size: 13px;
    margin: 0;
    text-align: left;
    width: 100%;
  }

  /* =========================================
   * GitHub 风格补充样式：引用块、分割线
   * ========================================= */

  /* 引用块 (Blockquote) — GitHub 经典的左侧竖线 + 灰色文字 */
  :global(.cm-blockquote) {
    border-left: 3px solid var(--theme-blockquote-border, #d0d7de);
    color: var(--theme-blockquote-color, #656d76);
    padding-left: 16px;
  }

  /* 水平分割线 (HR / ThematicBreak) */
  :global(.cm-hr) {
    border: none;
    border-bottom: 1px solid var(--theme-hr-color, #d0d7de);
    margin: 2px 0;
    height: 0;
  }

  /* 水平分割线所在行的包装样式，用于压缩边距与高度 */
  :global(.cm-live-hr-line) {
    padding: 0 !important;
    line-height: 1px !important;
    min-height: 0 !important;
    margin: 8px 0 !important;
  }

  /* GFM 删除线 */
  :global(.cm-live-strikethrough) {
    text-decoration: line-through;
  }

  /* GFM 链接 */
  :global(.cm-live-link) {
    color: #0969da;
    text-decoration: underline;
    cursor: pointer;
  }

  /* GFM 标题 H4-H6 */
  :global(.cm-live-h4) {
    font-size: 1.15em;
    font-weight: 600;
    padding-top: 6px;
    padding-bottom: 3px;
    margin: 0;
  }
  :global(.cm-live-h5) {
    font-size: 1em;
    font-weight: 600;
    padding-top: 6px;
    padding-bottom: 3px;
    margin: 0;
  }
  :global(.cm-live-h6) {
    font-size: 0.85em;
    font-weight: 600;
    color: var(--theme-blockquote-color, #656d76);
    padding-top: 6px;
    padding-bottom: 3px;
    margin: 0;
  }

  /* GFM Table 渲染样式 — 对齐 GitHub Primer */
  :global(.cm-live-table-container) {
    width: 100%;
    overflow-x: auto;
    margin: 16px 0;
  }
  :global(.cm-live-table) {
    border-collapse: collapse;
    width: 100%;
    font-size: 14px;
    line-height: 1.5;
  }
  :global(.cm-live-table th), :global(.cm-live-table td) {
    border: 1px solid var(--theme-math-border, #d0d7de);
    padding: 6px 13px;
  }
  :global(.cm-live-table tr) {
    background-color: var(--theme-codeblock-bg, #ffffff);
    border-top: 1px solid var(--theme-math-border, #d0d7de);
  }
  :global(.theme-light .cm-live-table tr:nth-child(2n)) {
    background-color: #f6f8fa;
  }
  :global(.theme-dark .cm-live-table tr:nth-child(2n)) {
    background-color: #161b22;
  }
  :global(.cm-live-table th) {
    font-weight: 600;
    background-color: var(--theme-codeblock-bg, #f6f8fa);
  }

  /* 强制编辑器使用统一的无衬线中英文字体（对齐 Typora） */
  :global(.cm-editor), :global(.cm-content) {
    font-family: 'Open Sans', 'Clear Sans', 'Helvetica Neue', Helvetica, Arial, 'Segoe UI Emoji', 'PingFang SC', 'Microsoft YaHei', '微软雅黑', 'Microsoft JhengHei', sans-serif !important;
  }
</style>
