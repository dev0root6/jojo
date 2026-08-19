import { useEffect, useRef } from 'react';

const INDENT = '    ';

/** Adds or removes one indent level from every line of a block. */
export function shiftLines(block: string, outdent: boolean, indent = INDENT): string {
  return block
    .split('\n')
    .map((line) => (outdent ? line.replace(new RegExp(`^ {1,${indent.length}}`), '') : indent + line))
    .join('\n');
}

/**
 * The whitespace a new line should start with, given the text before the
 * caret, or null when the new line needs no help.
 */
export function autoIndentFor(before: string, indent = INDENT): string | null {
  const current = (before.match(/^[ \t]*/) || [''])[0];
  const deeper = before.trimEnd().endsWith('{') ? indent : '';
  return current || deeper ? current + deeper : null;
}

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** 1-based lines the compiler flagged, marked in the gutter. */
  errorLines?: Set<number>;
  warningLines?: Set<number>;
}

/**
 * A plain textarea with a line-number gutter beside it.
 *
 * The gutter only lines up if both halves agree on metrics exactly, so the
 * font and the line height are pinned in CSS and wrapping is off — a wrapped
 * line would occupy two rows on one side and one on the other.
 */
export default function CodeEditor({ value, onChange, errorLines, warningLines }: CodeEditorProps) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const lineCount = Math.max(1, value.split('\n').length);

  useEffect(() => {
    syncScroll();
  }, [value]);

  function syncScroll() {
    if (gutter.current && textarea.current) gutter.current.scrollTop = textarea.current.scrollTop;
  }

  /** Replaces the selection while keeping the browser's native undo history. */
  function replaceSelection(text: string, selectionStart?: number, selectionEnd?: number) {
    const node = textarea.current;
    if (!node) return;
    node.focus();
    if (selectionStart !== undefined) node.setSelectionRange(selectionStart, selectionEnd ?? selectionStart);
    if (!document.execCommand('insertText', false, text)) {
      // execCommand is gone or refused: fall back to a plain state update.
      const start = node.selectionStart;
      const end = node.selectionEnd;
      const next = value.slice(0, start) + text + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => node.setSelectionRange(start + text.length, start + text.length));
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    const node = event.currentTarget;
    const { selectionStart, selectionEnd } = node;

    if (event.key === 'Tab') {
      event.preventDefault();
      const multiline = value.slice(selectionStart, selectionEnd).includes('\n');

      if (!multiline && !event.shiftKey) {
        replaceSelection(INDENT);
        return;
      }

      // Indent or outdent every line the selection touches.
      const from = value.lastIndexOf('\n', selectionStart - 1) + 1;
      const toEnd = value.indexOf('\n', selectionEnd);
      const to = toEnd === -1 ? value.length : toEnd;
      const block = value.slice(from, to);
      const shifted = shiftLines(block, event.shiftKey);
      if (shifted !== block) replaceSelection(shifted, from, to);
      return;
    }

    if (event.key === 'Enter') {
      const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
      // An open brace earns another level, which is most of what C needs.
      const indent = autoIndentFor(value.slice(lineStart, selectionStart));
      if (indent === null) return;
      event.preventDefault();
      replaceSelection('\n' + indent);
    }
  }

  return (
    <div className="code-editor-shell">
      <div className="code-gutter" ref={gutter} aria-hidden="true">
        {Array.from({ length: lineCount }, (_, index) => {
          const line = index + 1;
          const state = errorLines?.has(line) ? ' is-error' : warningLines?.has(line) ? ' is-warning' : '';
          return (
            <div className={'code-gutter-line' + state} key={line}>
              {line}
            </div>
          );
        })}
      </div>
      <textarea
        ref={textarea}
        className="code-editor"
        spellCheck={false}
        wrap="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onScroll={syncScroll}
        aria-label="C source code"
      />
    </div>
  );
}
