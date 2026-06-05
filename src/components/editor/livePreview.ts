import { Decoration, WidgetType, ViewPlugin, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { EditorState, SelectionRange, Range } from '@codemirror/state';
import type { SyntaxNodeRef } from '@lezer/common';
import katex from 'katex';

// 数学公式渲染 Widget
export class MathWidget extends WidgetType {
  formula: string;
  isBlock: boolean;

  constructor(formula: string, isBlock: boolean) {
    super();
    this.formula = formula;
    this.isBlock = isBlock;
  }

  toDOM(view: EditorView) {
    const span = document.createElement("span");
    span.className = this.isBlock ? "cm-live-math-block" : "cm-live-math-inline";

    try {
      katex.render(this.formula, span, {
        throwOnError: false,
        displayMode: this.isBlock
      });
    } catch (err) {
      span.textContent = `\\[${this.formula}\\]`;
      console.error("KaTeX render error:", err);
    }

    // 渲染后可能发生高度微小变化，通知 CodeMirror 刷新测绘地图防止光标漂移
    Promise.resolve().then(() => {
      view.requestMeasure();
    });

    return span;
  }

  eq(other: MathWidget) {
    return this.formula === other.formula && this.isBlock === other.isBlock;
  }
}

// 0.8. 占位式隐藏标记（供即时渲染折叠使用，保持物理 DOM 存在以防光标偏移）
export const hideMark = Decoration.replace({
  attributes: { class: "cm-live-hidden" }
});

// 辅助函数：将 Markdown/HTML 中的图片路径解析为 Tauri WebView 可以访问的安全资源路径
export function resolveImagePath(src: string, filePath: string): string {
  // 1. 如果是网络资源或已经是特殊协议资源，直接返回
  if (/^(https?:\/\/|data:|asset:\/\/)/i.test(src)) {
    return src;
  }

  // 2. 如果是绝对路径，直接转换
  const isWindowsAbsolute = /^[a-zA-Z]:[\\/]/i.test(src) || src.startsWith('\\\\');
  const isUnixAbsolute = src.startsWith('/');
  if (isWindowsAbsolute || isUnixAbsolute) {
    try {
      return convertFileSrc(src);
    } catch (err) {
      console.warn("Tauri convertFileSrc failed for absolute path. Falling back to raw path.", err);
      return src;
    }
  }

  // 3. 如果是相对路径且 filePath 存在，则拼接绝对路径
  if (filePath) {
    const isWindows = filePath.includes('\\');
    const separator = isWindows ? '\\' : '/';
    const lastSeparatorIndex = filePath.lastIndexOf(separator);
    
    if (lastSeparatorIndex !== -1) {
      const parentDir = filePath.substring(0, lastSeparatorIndex + 1);
      let cleanSrc = src;
      if (src.startsWith('./')) {
        cleanSrc = src.substring(2);
      } else if (src.startsWith('.\\')) {
        cleanSrc = src.substring(2);
      }
      
      const absolutePath = parentDir + cleanSrc;
      
      try {
        return convertFileSrc(absolutePath);
      } catch (err) {
        console.warn("Tauri convertFileSrc failed/not ready. Falling back to raw absolute path.", err);
        return absolutePath;
      }
    }
  }

  return src;
}

// 任务列表复选框 Widget
export class CheckboxWidget extends WidgetType {
  checked: boolean;
  pos: number;

  constructor(checked: boolean, pos: number) {
    super();
    this.checked = checked;
    this.pos = pos;
  }

  toDOM(view: EditorView) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.checked;
    input.className = "cm-live-todo-checkbox";
    
    input.addEventListener("change", (e) => {
      const target = e.target as HTMLInputElement;
      const newValue = target.checked ? "[x]" : "[ ]";
      view.dispatch({
        changes: { from: this.pos, to: this.pos + 3, insert: newValue }
      });
    });
    
    return input;
  }

  eq(other: CheckboxWidget) {
    return this.checked === other.checked && this.pos === other.pos;
  }
}

// 图片渲染 Widget
export class ImageWidget extends WidgetType {
  url: string;
  alt: string;

  constructor(url: string, alt: string) {
    super();
    this.url = url;
    this.alt = alt;
  }

  toDOM(view: EditorView) {
    const container = document.createElement("div");
    container.className = "cm-live-image-container";

    const img = document.createElement("img");
    img.src = this.url;
    img.alt = this.alt;
    img.className = "cm-live-image";
    
    img.onload = () => {
      view.requestMeasure();
    };
    
    container.appendChild(img);
    return container;
  }

  eq(other: ImageWidget) {
    return this.url === other.url && this.alt === other.alt;
  }
}

let mermaidInitialized = false;
let lastInitializedTheme: 'dark' | 'light' | null = null;

async function initMermaid() {
  if (mermaidInitialized) return;
  try {
    const m = await import('mermaid');
    m.default.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
    });
    mermaidInitialized = true;
  } catch (err) {
    console.warn("Failed to initialize mermaid:", err);
  }
}

// Mermaid 渲染 Widget
export class MermaidWidget extends WidgetType {
  code: string;

  constructor(code: string) {
    super();
    this.code = code;
  }

  toDOM(view: EditorView) {
    const container = document.createElement("div");
    container.className = "cm-live-mermaid-container";

    const id = "mermaid-" + Math.floor(Math.random() * 1000000);
    const renderDiv = document.createElement("div");
    renderDiv.id = id;
    container.appendChild(renderDiv);

    initMermaid().then(async () => {
      if (!mermaidInitialized) {
        container.textContent = "Failed to load Mermaid";
        return;
      }
      try {
        const m = await import('mermaid');
        const isDark = document.querySelector('.theme-dark') !== null;
        const currentTheme = isDark ? 'dark' : 'light';
        if (lastInitializedTheme !== currentTheme) {
          m.default.initialize({
            theme: isDark ? 'dark' : 'default',
            securityLevel: 'strict',
          });
          lastInitializedTheme = currentTheme;
        }
        const { svg } = await m.default.render(id + "-svg", this.code);
        renderDiv.innerHTML = svg;
        view.requestMeasure();
      } catch (err: any) {
        console.warn("Mermaid rendering error:", err);
        container.innerHTML = `<pre class="cm-live-mermaid-error">${err?.message || err}</pre>`;
        view.requestMeasure();
      }
    });

    return container;
  }

  eq(other: MermaidWidget) {
    return this.code === other.code;
  }
}

// GFM 表格渲染 Widget
export class TableWidget extends WidgetType {
  tableContent: string;

  /**
   * @param {string} tableContent - GFM 表格的原生 Markdown 源码文本。
   */
  constructor(tableContent: string) {
    super();
    this.tableContent = tableContent;
  }

  /**
   * 将 GFM 表格解析并渲染为结构化的 HTML <table> DOM。
   *
   * @returns {HTMLElement} 包含 <table> 的容器元素。
   */
  toDOM(): HTMLElement {
    const div = document.createElement("div");
    div.className = "cm-live-table-container";

    const table = document.createElement("table");
    table.className = "cm-live-table";

    const lines = this.tableContent.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length >= 2) {
      // 辅助解析行数据
      const parseRow = (line: string) => {
        let clean = line;
        if (clean.startsWith("|")) clean = clean.slice(1);
        if (clean.endsWith("|")) clean = clean.slice(0, -1);
        return clean.split("|").map(s => s.trim());
      };

      const headers = parseRow(lines[0]);
      const alignLine = parseRow(lines[1]);

      // 提取每列的对齐方式
      const alignments = alignLine.map(col => {
        if (col.startsWith(":") && col.endsWith(":")) return "center";
        if (col.endsWith(":")) return "right";
        return "left";
      });

      // 渲染表头
      const thead = document.createElement("thead");
      const headerRow = document.createElement("tr");
      headers.forEach((h, index) => {
        const th = document.createElement("th");
        th.textContent = h;
        th.style.textAlign = alignments[index] || "left";
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);

      // 渲染表体
      const tbody = document.createElement("tbody");
      for (let i = 2; i < lines.length; i++) {
        const rowData = parseRow(lines[i]);
        const tr = document.createElement("tr");
        headers.forEach((_, colIndex) => {
          const td = document.createElement("td");
          td.textContent = rowData[colIndex] || "";
          td.style.textAlign = alignments[colIndex] || "left";
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
    }

    div.appendChild(table);
    return div;
  }

  eq(other: TableWidget): boolean {
    return this.tableContent === other.tableContent;
  }
}

// 水平分割线 Widget（渲染 Markdown 的 --- / *** / ___）
export class HRWidget extends WidgetType {
  toDOM() {
    const hr = document.createElement("hr");
    hr.className = "cm-hr";
    return hr;
  }

  eq() {
    return true; // 所有水平线都相同
  }
}

// 各个 Markdown 语法节点的独立渲染 Handler
function handleStrongEmphasis(node: SyntaxNodeRef, state: EditorState, builder: Range<Decoration>[]) {
  if (node.to - node.from >= 4) {
    builder.push(hideMark.range(node.from, node.from + 2));
    builder.push(Decoration.mark({ class: "cm-live-bold" }).range(node.from + 2, node.to - 2));
    builder.push(hideMark.range(node.to - 2, node.to));
  }
}

function handleEmphasis(node: SyntaxNodeRef, state: EditorState, builder: Range<Decoration>[]) {
  if (node.to - node.from >= 2) {
    builder.push(hideMark.range(node.from, node.from + 1));
    builder.push(Decoration.mark({ class: "cm-live-italic" }).range(node.from + 1, node.to - 1));
    builder.push(hideMark.range(node.to - 1, node.to));
  }
}

function handleInlineCode(node: SyntaxNodeRef, state: EditorState, builder: Range<Decoration>[]) {
  if (node.to - node.from >= 2) {
    builder.push(hideMark.range(node.from, node.from + 1));
    builder.push(Decoration.mark({ class: "cm-live-inline-code" }).range(node.from + 1, node.to - 1));
    builder.push(hideMark.range(node.to - 1, node.to));
  }
}

function handleTaskListMarker(node: SyntaxNodeRef, state: EditorState, builder: Range<Decoration>[]) {
  if (node.to - node.from >= 3) {
    const text = state.sliceDoc(node.from, node.to);
    const isChecked = text.includes("x") || text.includes("X");
    builder.push(
      Decoration.replace({
        widget: new CheckboxWidget(isChecked, node.from)
      }).range(node.from, node.to)
    );
  }
}

function handleImage(node: SyntaxNodeRef, state: EditorState, builder: Range<Decoration>[], filePath: string) {
  const text = state.sliceDoc(node.from, node.to);
  const match = /!\[(.*?)\]\((.*?)\)/.exec(text);
  if (match) {
    const alt = match[1];
    const rawUrl = match[2];
    const resolvedUrl = resolveImagePath(rawUrl, filePath);
    builder.push(
      Decoration.replace({
        widget: new ImageWidget(resolvedUrl, alt)
      }).range(node.from, node.to)
    );
  }
}

function handleFencedCode(node: SyntaxNodeRef, state: EditorState, builder: Range<Decoration>[], selection: SelectionRange, hasFocus: boolean) {
  const text = state.sliceDoc(node.from, node.to);
  const isMermaid = /^```mermaid\b/.test(text);
  if (isMermaid) {
    const isCodeBlockActive = hasFocus && (selection.from <= node.to) && (selection.to >= node.from);
    if (!isCodeBlockActive) {
      const lines = text.split("\n");
      const lastLine = lines[lines.length - 1].trim();
      const codeLines = lastLine === "```" ? lines.slice(1, lines.length - 1) : lines.slice(1);
      const code = codeLines.join("\n");
      
      const startLine = state.doc.lineAt(node.from);
      const endLine = state.doc.lineAt(node.to);

      if (startLine.number === endLine.number) {
        builder.push(
          Decoration.replace({
            widget: new MermaidWidget(code)
          }).range(node.from, node.to)
        );
      } else {
        builder.push(
          Decoration.replace({
            widget: new MermaidWidget(code)
          }).range(startLine.from, startLine.to)
        );
        
        for (let l = startLine.number + 1; l <= endLine.number; l++) {
          const lineObj = state.doc.line(l);
          builder.push(
            Decoration.replace({}).range(lineObj.from, lineObj.to)
          );
          builder.push(
            Decoration.line({
              attributes: { class: "cm-live-hidden-line" }
            }).range(lineObj.from)
          );
        }
      }
    }
  }
}

function handleHTMLBlock(node: SyntaxNodeRef, state: EditorState, builder: Range<Decoration>[], selection: SelectionRange, filePath: string, hasFocus: boolean) {
  const text = state.sliceDoc(node.from, node.to);
  const imgRegex = /<img\s+[^>]*src=["'](.*?)["'][^>]*>/i;
  const match = imgRegex.exec(text);
  if (match) {
    const imgTagText = match[0];
    const imgStartOffset = node.from + match.index;
    const imgEndOffset = imgStartOffset + imgTagText.length;

    const isImgActive = hasFocus && (selection.from <= imgEndOffset) && (selection.to >= imgStartOffset);
    if (!isImgActive) {
      const rawUrl = match[1];
      const altMatch = /alt=["'](.*?)["']/i.exec(imgTagText);
      const alt = altMatch ? altMatch[1] : "image";
      const resolvedUrl = resolveImagePath(rawUrl, filePath);
      
      const startLine = state.doc.lineAt(node.from);
      const endLine = state.doc.lineAt(node.to);

      if (startLine.number === endLine.number) {
        builder.push(
          Decoration.replace({
            widget: new ImageWidget(resolvedUrl, alt)
          }).range(node.from, node.to)
        );
      } else {
        builder.push(
          Decoration.replace({
            widget: new ImageWidget(resolvedUrl, alt)
          }).range(startLine.from, startLine.to)
        );
        
        for (let l = startLine.number + 1; l <= endLine.number; l++) {
          const lineObj = state.doc.line(l);
          builder.push(
            Decoration.replace({}).range(lineObj.from, lineObj.to)
          );
          builder.push(
            Decoration.line({
              attributes: { class: "cm-live-hidden-line" }
            }).range(lineObj.from)
          );
        }
      }
    }
  }
}

function handleHeading(node: SyntaxNodeRef, state: EditorState, builder: Range<Decoration>[], className: string) {
  const text = state.sliceDoc(node.from, node.to);
  const match = /^(#+)\s+/.exec(text);
  if (match) {
    const markerLen = match[0].length;
    builder.push(hideMark.range(node.from, node.from + markerLen));
    builder.push(Decoration.line({ class: className }).range(node.from));
  }
}

function handleBlockquote(node: SyntaxNodeRef, state: EditorState, builder: Range<Decoration>[]) {
  const startLine = state.doc.lineAt(node.from);
  const endLine = state.doc.lineAt(node.to);
  for (let l = startLine.number; l <= endLine.number; l++) {
    const lineObj = state.doc.line(l);
    builder.push(
      Decoration.line({ class: "cm-blockquote" }).range(lineObj.from)
    );
  }
}

/**
 * GFM 表格渲染处理器。
 * 如果当前表格不处于编辑状态，用 TableWidget 渲染 HTML 表格。
 *
 * @param {SyntaxNodeRef} node - 表格语法树节点。
 * @param {EditorState} state - CodeMirror 的 EditorState。
 * @param {Range<Decoration>[]} builder - 装饰器数组。
 * @param {SelectionRange} selection - 当前光标选择范围。
 * @param {boolean} hasFocus - 编辑器是否获取焦点。
 * @returns {void}
 */
function handleTable(node: SyntaxNodeRef, state: EditorState, builder: Range<Decoration>[], selection: SelectionRange, hasFocus: boolean): void {
  const isTableActive = hasFocus && (selection.from <= node.to) && (selection.to >= node.from);
  if (!isTableActive) {
    const text = state.sliceDoc(node.from, node.to);
    const startLine = state.doc.lineAt(node.from);
    const endLine = state.doc.lineAt(node.to);

    if (startLine.number === endLine.number) {
      builder.push(
        Decoration.replace({
          widget: new TableWidget(text)
        }).range(node.from, node.to)
      );
    } else {
      builder.push(
        Decoration.replace({
          widget: new TableWidget(text)
        }).range(startLine.from, startLine.to)
      );
      for (let l = startLine.number + 1; l <= endLine.number; l++) {
        const lineObj = state.doc.line(l);
        builder.push(Decoration.replace({}).range(lineObj.from, lineObj.to));
        builder.push(
          Decoration.line({
            attributes: { class: "cm-live-hidden-line" }
          }).range(lineObj.from)
        );
      }
    }
  }
}

/**
 * GFM 删除线处理器。
 * 隐藏波浪号标记，并对其中的文字应用删除线样式。
 *
 * @param {SyntaxNodeRef} node - 删除线语法树节点。
 * @param {EditorState} state - CodeMirror 的 EditorState。
 * @param {Range<Decoration>[]} builder - 装饰器数组。
 * @returns {void}
 */
function handleStrikethrough(node: SyntaxNodeRef, state: EditorState, builder: Range<Decoration>[]) {
  if (node.to - node.from >= 4) {
    builder.push(hideMark.range(node.from, node.from + 2));
    builder.push(Decoration.mark({ class: "cm-live-strikethrough" }).range(node.from + 2, node.to - 2));
    builder.push(hideMark.range(node.to - 2, node.to));
  }
}

/**
 * Markdown 链接折叠渲染处理器。
 * 隐藏方括号和 URL 圆括号，仅渲染链接文本并应用下划线/蓝色主题色。
 */
function handleLink(node: SyntaxNodeRef, state: EditorState, builder: Range<Decoration>[]) {
  const actualNode = node.node;
  let linkTextChild = actualNode.firstChild;
  while (linkTextChild && linkTextChild.name !== "LinkText") {
    linkTextChild = linkTextChild.nextSibling;
  }
  if (linkTextChild) {
    builder.push(hideMark.range(node.from, linkTextChild.from));
    builder.push(Decoration.mark({ class: "cm-live-link" }).range(linkTextChild.from, linkTextChild.to));
    builder.push(hideMark.range(linkTextChild.to, node.to));
  }
}

// LaTeX 可视区域公式扫描与处理
function handleMathDecorations(view: EditorView, builder: Range<Decoration>[], selection: SelectionRange, hasFocus: boolean) {
  const state = view.state;
  // 获取当前可视区域范围并向外延伸，防止公式被截断
  const visibleStart = view.visibleRanges[0]?.from ?? 0;
  const visibleEnd = view.visibleRanges[view.visibleRanges.length - 1]?.to ?? state.doc.length;

  const from = Math.max(0, visibleStart - 3000);
  const to = Math.min(state.doc.length, visibleEnd + 3000);

  const docText = state.sliceDoc(from, to);
  const mathRegex = /\\\[([\s\S]*?)\\\]/g;
  let match;
  while ((match = mathRegex.exec(docText)) !== null) {
    const mathContent = match[1];
    const matchStart = from + match.index;
    const matchEnd = matchStart + match[0].length;

    try {
      const startLine = state.doc.lineAt(matchStart);
      const endLine = state.doc.lineAt(matchEnd);
      const isBlock = startLine.number !== endLine.number;
      const isMathActive = hasFocus && (selection.from <= endLine.to) && (selection.to >= startLine.from);

      if (!isMathActive) {
        if (isBlock) {
          builder.push(
            Decoration.replace({
              widget: new MathWidget(mathContent, true)
            }).range(startLine.from, startLine.to)
          );
          
          for (let l = startLine.number + 1; l <= endLine.number; l++) {
            const lineObj = state.doc.line(l);
            builder.push(
              Decoration.replace({}).range(lineObj.from, lineObj.to)
            );
            builder.push(
              Decoration.line({
                attributes: { class: "cm-live-hidden-line" }
              }).range(lineObj.from)
            );
          }
        } else {
          builder.push(
            Decoration.replace({
              widget: new MathWidget(mathContent, false)
            }).range(matchStart, matchEnd)
          );
        }
      } else if (isBlock) {
        builder.push(
          Decoration.widget({
            widget: new MathWidget(mathContent, true)
          }).range(endLine.to)
        );
      }
    } catch (err) {
      console.error("Error processing math decoration:", err);
    }
  }
}

/**
 * 工厂函数：动态生成带有指定 filePath 的即时渲染 (Live Preview) CodeMirror 插件
 * @param filePath 当前打开文档的本地绝对路径
 */
export function createLivePreviewExtension(filePath: string) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet || update.viewportChanged || update.focusChanged) {
          this.decorations = this.buildDecorations(update.view);
        }
      }

      buildDecorations(view: EditorView): DecorationSet {
        const builder: Range<Decoration>[] = [];
        const state = view.state;
        const selection = state.selection.main;
        const hasFocus = view.hasFocus; // 获取编辑器当前是否拥有焦点

        for (let { from, to } of view.visibleRanges) {
          syntaxTree(state).iterate({
            from,
            to,
            enter(node) {
              try {
                const nodeLine = state.doc.lineAt(node.from);
                const isLineActive = hasFocus && (selection.from <= nodeLine.to) && (selection.to >= nodeLine.from);
                if (isLineActive) {
                  return;
                }

                switch (node.name) {
                  case "StrongEmphasis":
                    handleStrongEmphasis(node, state, builder);
                    break;
                  case "Emphasis":
                    handleEmphasis(node, state, builder);
                    break;
                  case "InlineCode":
                    handleInlineCode(node, state, builder);
                    break;
                  case "TaskListMarker":
                    handleTaskListMarker(node, state, builder);
                    break;
                  case "Image":
                    handleImage(node, state, builder, filePath);
                    break;
                  case "FencedCode":
                    handleFencedCode(node, state, builder, selection, hasFocus);
                    break;
                  case "HTMLBlock":
                    handleHTMLBlock(node, state, builder, selection, filePath, hasFocus);
                    break;
                  case "Table":
                    handleTable(node, state, builder, selection, hasFocus);
                    break;
                  case "Strikethrough":
                    handleStrikethrough(node, state, builder);
                    break;
                  case "Link":
                    handleLink(node, state, builder);
                    break;
                  case "ATXHeading1":
                    handleHeading(node, state, builder, "cm-live-h1");
                    break;
                  case "ATXHeading2":
                    handleHeading(node, state, builder, "cm-live-h2");
                    break;
                  case "ATXHeading3":
                    handleHeading(node, state, builder, "cm-live-h3");
                    break;
                  case "ATXHeading4":
                    handleHeading(node, state, builder, "cm-live-h4");
                    break;
                  case "ATXHeading5":
                    handleHeading(node, state, builder, "cm-live-h5");
                    break;
                  case "ATXHeading6":
                    handleHeading(node, state, builder, "cm-live-h6");
                    break;
                  case "HorizontalRule":
                    builder.push(
                      Decoration.replace({
                        widget: new HRWidget()
                      }).range(node.from, node.to)
                    );
                    builder.push(
                      Decoration.line({
                        attributes: { class: "cm-live-hr-line" }
                      }).range(node.from)
                    );
                    break;
                  case "Blockquote":
                    handleBlockquote(node, state, builder);
                    break;
                }
              } catch (err) {
                console.error("LivePreview error entering node:", node.name, err);
              }
            }
          });
        }

        // 全局扫描 LaTeX 公式
        handleMathDecorations(view, builder, selection, hasFocus);
        
        builder.sort((a, b) => a.from - b.from);
        
        try {
          return Decoration.set(builder, true);
        } catch (e) {
          console.error("LivePreview error building decorations:", e);
          return Decoration.none;
        }
      }
    },
    {
      decorations: v => v.decorations
    }
  );
}
