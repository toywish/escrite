<script lang="ts">
  import Editor from '../components/Editor.svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { open, save, ask } from '@tauri-apps/plugin-dialog';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { listen } from '@tauri-apps/api/event';
  import { onMount } from 'svelte';
  let currentFilePath = "";
  let currentFileContent = "# 新建文档\n\n开始您的极简写作吧...\n\n- 勾选上方的 **Vim 模式** 可以体验纯键盘操作；\n- 点击 **保存** 可将内容写入本地 .md 文件。";
  let isSaving = false;
  let enableVim = false; // 默认不开启 Vim 模式，使用常规的普通打字编辑体验
  let isDarkMode = false; // 默认使用明亮模式
  let enableLivePreview = true; // 默认开启即时渲染 (Live Preview) 模式
  let editorRef: any;

  // 用于跟踪保存状态
  let lastSavedContent = currentFileContent.replace(/\r\n/g, "\n");
  $: isModified = currentFileContent.replace(/\r\n/g, "\n") !== lastSavedContent.replace(/\r\n/g, "\n");

  // 响应式监听暗黑模式变化，动态切换 Tauri 系统窗口的标题栏主题
  $: {
    if (typeof window !== 'undefined') {
      try {
        getCurrentWindow().setTheme(isDarkMode ? 'dark' : 'light');
      } catch (err) {
        console.error("Failed to set window theme:", err);
      }
    }
  }

  // 响应式监听文件名与修改状态变化，动态设置操作系统原生窗口标题
  $: {
    if (typeof window !== 'undefined') {
      const fileName = currentFilePath ? currentFilePath.split(/[\\/]/).pop() : '新建空白文档.md';
      const indicator = isModified ? ' *' : '';
      try {
        getCurrentWindow().setTitle(`${fileName}${indicator} - Escrite`);
      } catch (err) {
        console.error("Failed to set window title:", err);
      }
    }
  }

  let runtimeErrors: string[] = [];

  /**
   * Reads and loads a dropped Markdown file into the editor.
   * If the current document has unsaved modifications, prompts the user to confirm.
   *
   * @param {string} filePath - The absolute file path of the dropped markdown file.
   * @returns {Promise<void>}
   */
  async function handleOpenDroppedFile(filePath: string): Promise<void> {
    if (isModified) {
      const confirmResult = await ask("当前文档有未保存的改动，确认打开新文件吗？", {
        title: "提示",
        kind: "warning",
        okLabel: "确认",
        cancelLabel: "取消"
      });
      if (!confirmResult) return;
    }
    try {
      const content = await invoke<string>('read_md_file', { filePath });
      const normalized = content.replace(/\r\n/g, "\n");
      currentFilePath = filePath;
      currentFileContent = normalized;
      lastSavedContent = normalized;
    } catch (err) {
      console.error(err);
      alert("打开文件失败: " + err);
    }
  }

  onMount(() => {
    let unlistenClose: (() => void) | undefined;
    let unlistenDragDrop: (() => void) | undefined;
    
    let isExiting = false;
    
    // 监听窗口关闭事件
    getCurrentWindow().onCloseRequested(async (event) => {
      if (isExiting) {
        return;
      }
      if (isModified) {
        event.preventDefault();
        const confirmResult = await ask("当前文档有未保存的改动，确认退出吗？", {
          title: "提示",
          kind: "warning",
          okLabel: "退出",
          cancelLabel: "取消"
        });
        if (confirmResult) {
          isExiting = true;
          getCurrentWindow().destroy();
        }
      }
    }).then(unlisten => {
      unlistenClose = unlisten;
    });

    // 监听拖拽放开事件
    listen<any>('tauri://drag-drop', async (event) => {
      const paths = event.payload.paths;
      if (paths && paths.length > 0) {
        const filePath = paths[0];
        const ext = filePath.split('.').pop()?.toLowerCase();
        if (ext === 'md' || ext === 'markdown') {
          await handleOpenDroppedFile(filePath);
        } else if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext || '')) {
          if (editorRef) {
            editorRef.insertText(`![图片](${filePath})`);
          }
        }
      }
    }).then(unlisten => {
      unlistenDragDrop = unlisten;
    });

    const handleError = (e: ErrorEvent) => {
      runtimeErrors = [...runtimeErrors, e.message + "\n" + (e.error?.stack || "")];
    };
    const handleRejection = (e: PromiseRejectionEvent) => {
      runtimeErrors = [...runtimeErrors, "Unhandled Rejection: " + e.reason + (e.reason?.stack ? "\n" + e.reason.stack : "")];
    };
    
    // 全局快捷键监听（如 Ctrl+S 保存）
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveFile();
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      if (unlistenClose) unlistenClose();
      if (unlistenDragDrop) unlistenDragDrop();
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  });

  let isCopied = false;
  let copyTimeout: ReturnType<typeof setTimeout> | undefined;

  // 复制错误日志到剪贴板
  async function handleCopyErrors() {
    try {
      await navigator.clipboard.writeText(runtimeErrors.join("\n\n"));
      isCopied = true;
      if (copyTimeout) clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => {
        isCopied = false;
      }, 3000);
    } catch (err) {
      alert("复制失败: " + err);
    }
  }

  // 新建空白文档
  async function handleNewFile() {
    if (isModified) {
      const confirmResult = await ask("当前文档有未保存的改动，确认新建吗？", {
        title: "提示",
        kind: "warning",
        okLabel: "确认",
        cancelLabel: "取消"
      });
      if (!confirmResult) return;
    }
    currentFilePath = "";
    currentFileContent = "# 新建文档\n\n开始您的极简写作吧...\n\n- 勾选上方的 **Vim 模式** 可以体验纯键盘操作；\n- 点击 **保存** 可将内容写入本地 .md 文件。";
    lastSavedContent = currentFileContent.replace(/\r\n/g, "\n");
  }

  // 打开本地 Markdown 文件
  async function handleOpenFile() {
    if (isModified) {
      const confirmResult = await ask("当前文档有未保存的改动，确认打开新文件吗？", {
        title: "提示",
        kind: "warning",
        okLabel: "确认",
        cancelLabel: "取消"
      });
      if (!confirmResult) return;
    }
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
      });
      
      if (selected && typeof selected === 'string') {
        // 先异步读取文件内容，以防中间状态引发 Svelte 销毁重载时的竞态问题
        const content = await invoke<string>('read_md_file', { filePath: selected });
        const normalized = content.replace(/\r\n/g, "\n");
        currentFilePath = selected;
        currentFileContent = normalized;
        lastSavedContent = normalized;
      }
    } catch (err) {
      console.error(err);
      alert("打开文件失败: " + err);
    }
  }

  // 保存当前编辑器内容到本地
  async function handleSaveFile() {
    if (!currentFilePath) {
      // 尝试提取文档的第一个一级标题作为默认文件名，否则使用 "Untitled.md"
      let defaultName = "Untitled.md";
      const headerMatch = currentFileContent.match(/^#\s+(.+)$/m);
      if (headerMatch && headerMatch[1]) {
        // 清理文件名中 Windows/OS 不允许的非法字符
        const sanitized = headerMatch[1].replace(/[\\/:*?"<>|]/g, "").trim();
        if (sanitized) {
          defaultName = `${sanitized}.md`;
        }
      }

      const selected = await save({
        filters: [{ name: 'Markdown', extensions: ['md'] }],
        defaultPath: defaultName
      });
      if (selected) {
        currentFilePath = selected;
      } else {
        return; // 用户取消了另存为
      }
    }

    isSaving = true;
    try {
      // 调用 Rust 命令写入文件
      await invoke('save_md_file', {
        filePath: currentFilePath,
        content: currentFileContent
      });
      lastSavedContent = currentFileContent.replace(/\r\n/g, "\n");
    } catch (err) {
      console.error(err);
      alert("保存文件失败: " + err);
    } finally {
      isSaving = false;
    }
  }
</script>

<div class="app-window {isDarkMode ? 'theme-dark' : 'theme-light'}">
  <!-- 极简工具栏 -->
  <header class="toolbar">
    <div class="actions">
      <button on:click={handleNewFile}>新建 (New)</button>
      <button on:click={handleOpenFile}>打开 (Open)</button>
      <button on:click={handleSaveFile} disabled={isSaving}>
        {isSaving ? '正在保存...' : '保存 (Save)'}
      </button>
      <button class="theme-toggle" on:click={() => isDarkMode = !isDarkMode}>
        {isDarkMode ? '☀️ 明亮' : '🌙 暗黑'}
      </button>
    </div>
    <div class="vim-option">
      <label style="margin-right: 12px;">
        <input type="checkbox" bind:checked={enableVim} />
        Vim 模式
      </label>
      <label>
        <input type="checkbox" bind:checked={enableLivePreview} />
        即时渲染
      </label>
    </div>
    <div class="divider"></div>
    <div class="status-path">{currentFilePath || "新建空白文档.md"}</div>
  </header>

  <!-- 编辑区 -->
  <main class="editor-area">
    {#key [enableVim, isDarkMode, currentFilePath, enableLivePreview]}
      <Editor bind:this={editorRef} bind:fileContent={currentFileContent} {enableVim} {isDarkMode} filePath={currentFilePath} {enableLivePreview} onSave={handleSaveFile} />
    {/key}
  </main>

  {#if runtimeErrors.length > 0}
    <div style="position: fixed; bottom: 0; left: 0; right: 0; background: rgba(220, 20, 60, 0.95); color: white; padding: 20px; font-family: monospace; z-index: 999999; max-height: 250px; overflow-y: auto; user-select: text; border-top: 3px solid #ff4d4d; box-shadow: 0 -4px 20px rgba(0,0,0,0.5);">
      <h3 style="margin-top: 0; color: #ffeb3b;">⚠️ 运行时崩溃捕获 (Runtime Errors Caught):</h3>
      {#each runtimeErrors as err}
        <pre style="margin: 5px 0; border-bottom: 1px dashed rgba(255,255,255,0.4); padding-bottom: 5px; white-space: pre-wrap; font-size: 13px;">{err}</pre>
      {/each}
      <button on:click={handleCopyErrors} style="background: #388bfd; color: white; border: none; padding: 5px 12px; cursor: pointer; border-radius: 4px; font-weight: bold; margin-top: 5px; margin-right: 10px;">
        {isCopied ? '已复制 ✔' : '复制日志 (Copy Log)'}
      </button>
      <button on:click={() => runtimeErrors = []} style="background: white; color: red; border: none; padding: 5px 12px; cursor: pointer; border-radius: 4px; font-weight: bold; margin-top: 5px;">清除日志 (Clear Log)</button>
    </div>
  {/if}
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    user-select: none;
    overflow: hidden;
  }

  .app-window {
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
    transition: background-color 0.15s, color 0.15s;
  }

  /* 主题敏感样式 — GitHub Primer 配色 */
  .app-window.theme-dark {
    background-color: #0d1117;
    color: #e6edf3;
  }
  .app-window.theme-light {
    background-color: #ffffff;
    color: #1f2328;
  }

  .toolbar {
    height: 40px;
    display: flex;
    align-items: center;
    padding: 0 16px;
    gap: 16px;
    box-sizing: border-box;
    transition: background-color 0.15s, border-color 0.15s;
  }

  .theme-dark .toolbar {
    background-color: #161b22;
    border-bottom: 1px solid #30363d;
  }
  .theme-light .toolbar {
    background-color: #f6f8fa;
    border-bottom: 1px solid #d0d7de;
  }

  .actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0; /* 按鈕不受挤压，始终保持原始宽度 */
  }

  .actions button {
    border: 1px solid transparent;
    padding: 4px 12px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: background-color 0.15s, border-color 0.15s, color 0.15s;
  }

  .theme-dark .actions button {
    background-color: #21262d;
    color: #c9d1d9;
    border-color: #30363d;
  }
  .theme-dark .actions button:hover:not(:disabled) {
    background-color: #30363d;
    border-color: #484f58;
  }

  .theme-light .actions button {
    background-color: #ffffff;
    color: #1f2328;
    border-color: #d0d7de;
  }
  .theme-light .actions button:hover:not(:disabled) {
    background-color: #f3f4f6;
    border-color: #636c76;
  }

  .actions button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .status-path {
    font-size: 12px;
    flex: 1;          /* 占满剩余空间 */
    min-width: 0;     /* 允许 flex 子项收缩到 0，使 ellipsis 生效 */
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: color 0.15s;
  }

  .theme-dark .status-path {
    color: #848d97;
  }
  .theme-light .status-path {
    color: #636c76;
  }

  .divider {
    width: 1px;
    height: 14px;
    transition: background-color 0.15s;
  }

  .theme-dark .divider {
    background-color: #30363d;
  }
  .theme-light .divider {
    background-color: #d0d7de;
  }

  .editor-area {
    flex: 1;
    height: calc(100vh - 40px);
    overflow: hidden;
  }

  .vim-option {
    display: flex;
    align-items: center;
    font-size: 12px;
    cursor: pointer;
    transition: color 0.15s;
  }

  .theme-dark .vim-option {
    color: #e6edf3;
  }
  .theme-light .vim-option {
    color: #1f2328;
  }

  .vim-option label {
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
  }

  .vim-option input[type="checkbox"] {
    cursor: pointer;
    margin: 0;
    accent-color: #539bf5;
  }
</style>
