<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorState } from '@codemirror/state';
  import { EditorView, keymap, lineNumbers } from '@codemirror/view'; // lineNumbers 在 Vim 模式下启用
  import { markdown } from '@codemirror/lang-markdown';
  import { vim } from '@replit/codemirror-vim';
  import { defaultKeymap } from '@codemirror/commands';

  export let fileContent: string = "";
  export let enableVim: boolean = false;
  export let isDarkMode: boolean = true;

  let editorContainer: HTMLDivElement;
  let view: EditorView;

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
    // 1. 动态构建 CodeMirror 的扩展插件列表
    const extensions = [
      markdown(),              // Markdown 语法高亮
      EditorView.lineWrapping, // 自动换行
      keymap.of(defaultKeymap),  // 默认按键映射
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          // 实时将编辑器的内容同步到外部绑定变量中
          fileContent = update.state.doc.toString();
        }
      })
    ];

    // 如果启用了 Vim 模式，则同时加载 Vim 模拟器和行号显示
    if (enableVim) {
      extensions.push(vim());
      extensions.push(lineNumbers()); // Vim 模式下显示行号，方便行跳转操作
    }

    // 动态应用自定义主题样式以自适应外部暗黑/明亮切换
    const customTheme = EditorView.theme({
      "&": {
        height: "100%",
        fontSize: "15px",
        fontFamily: "'Fira Code', Consolas, Monaco, monospace",
        backgroundColor: isDarkMode ? "#22272e" : "#ffffff",
        color: isDarkMode ? "#adbac7" : "#24292f"
      },
      ".cm-content": {
        caretColor: isDarkMode ? "#adbac7" : "#24292f",
        padding: "20px 40px"
      },
      ".cm-cursor": {
        borderLeftColor: isDarkMode ? "#adbac7" : "#24292f"
      },
      ".cm-gutters": {
        backgroundColor: isDarkMode ? "#2d333b" : "#f6f8fa",
        color: isDarkMode ? "#768390" : "#57606a",
        border: "none",
        paddingRight: "10px"
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
  });

  onDestroy(() => {
    if (view) {
      view.destroy();
    }
  });
</script>

<div class="editor-wrapper" bind:this={editorContainer}></div>

<style>
  .editor-wrapper {
    width: 100%;
    height: 100%;
    outline: none;
  }
  
  /* 自定义 CodeMirror 高度铺满容器 */
  :global(.cm-editor) {
    height: 100%;
  }
</style>
