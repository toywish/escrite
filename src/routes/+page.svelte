<script lang="ts">
  import Editor from '../components/Editor.svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { open, save } from '@tauri-apps/plugin-dialog';

  let currentFilePath = "";
  let currentFileContent = "# 新建文档\n\n开始您的极简写作吧...\n\n- 勾选上方的 **Vim 模式** 可以体验纯键盘操作；\n- 点击 **保存** 可将内容写入本地 .md 文件。";
  let isSaving = false;
  let enableVim = false; // 默认不开启 Vim 模式，使用常规的普通打字编辑体验
  let isDarkMode = true; // 默认开启黑夜模式，适合暗光护眼

  // 新建空白文档
  function handleNewFile() {
    currentFilePath = "";
    currentFileContent = "# 新建文档\n\n开始您的极简写作吧...\n\n- 勾选上方的 **Vim 模式** 可以体验纯键盘操作；\n- 点击 **保存** 可将内容写入本地 .md 文件。";
  }

  // 打开本地 Markdown 文件
  async function handleOpenFile() {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
      });
      
      if (selected && typeof selected === 'string') {
        // 先异步读取文件内容，以防中间状态引发 Svelte 销毁重载时的竞态问题
        const content = await invoke<string>('read_md_file', { filePath: selected });
        currentFilePath = selected;
        currentFileContent = content;
      }
    } catch (err) {
      console.error(err);
      alert("打开文件失败: " + err);
    }
  }

  // 保存当前编辑器内容到本地
  async function handleSaveFile() {
    if (!currentFilePath) {
      const selected = await save({
        filters: [{ name: 'Markdown', extensions: ['md'] }]
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
      alert("文件保存成功！");
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
      <label>
        <input type="checkbox" bind:checked={enableVim} />
        Vim 模式
      </label>
    </div>
    <div class="divider"></div>
    <div class="status-path">{currentFilePath || "新建空白文档.md"}</div>
  </header>

  <!-- 编辑区 -->
  <main class="editor-area">
    {#key [enableVim, isDarkMode, currentFilePath]}
      <Editor bind:fileContent={currentFileContent} {enableVim} {isDarkMode} />
    {/key}
  </main>
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

  /* 主题敏感样式 */
  .app-window.theme-dark {
    background-color: #22272e;
    color: #adbac7;
  }
  .app-window.theme-light {
    background-color: #ffffff;
    color: #24292f;
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
    background-color: #2d333b;
    border-bottom: 1px solid #1c2128;
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
    background-color: #22272e;
    color: #adbac7;
    border-color: #444c56;
  }
  .theme-dark .actions button:hover:not(:disabled) {
    background-color: #2d333b;
    border-color: #768390;
  }

  .theme-light .actions button {
    background-color: #ffffff;
    color: #24292f;
    border-color: #d0d7de;
  }
  .theme-light .actions button:hover:not(:disabled) {
    background-color: #f3f4f6;
    border-color: #57606a;
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
    color: #768390;
  }
  .theme-light .status-path {
    color: #57606a;
  }

  .divider {
    width: 1px;
    height: 14px;
    transition: background-color 0.15s;
  }

  .theme-dark .divider {
    background-color: #444c56;
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
    color: #adbac7;
  }
  .theme-light .vim-option {
    color: #24292f;
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
