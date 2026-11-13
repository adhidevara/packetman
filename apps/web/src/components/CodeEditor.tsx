"use client";

import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import CodeMirror from "@uiw/react-codemirror";
import { useMemo } from "react";

export type EditorLanguage = "json" | "javascript" | "xml" | "html" | "text";

const highlight = HighlightStyle.define([
  { tag: [t.propertyName], color: "var(--info)" },
  { tag: [t.string, t.special(t.string)], color: "var(--ok)" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "var(--warn)" },
  { tag: [t.keyword, t.operatorKeyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword], color: "var(--violet)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--faint)", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--brass)" },
  { tag: [t.tagName], color: "var(--info)" },
  { tag: [t.attributeName], color: "var(--warn)" },
  { tag: [t.punctuation, t.bracket], color: "var(--muted)" },
]);

const baseTheme = EditorView.theme({
  "&": { color: "var(--text)" },
  ".cm-content": { caretColor: "var(--brass)", padding: "6px 0" },
  ".cm-line": { padding: "0 10px" },
  ".cm-placeholder": { color: "var(--faint)" },
  ".cm-tooltip": { background: "var(--raised)", border: "1px solid var(--line-strong)" },
  ".cm-foldPlaceholder": { background: "var(--raised)", border: "none", color: "var(--muted)" },
});

function languageExtension(lang: EditorLanguage) {
  switch (lang) {
    case "json":
      return [json()];
    case "javascript":
      return [javascript()];
    case "xml":
    case "html":
      return [xml()];
    default:
      return [];
  }
}

export function CodeEditor({
  value,
  onChange,
  language = "text",
  readOnly = false,
  placeholder,
  wrap = true,
  lineNumbers = true,
  ariaLabel,
}: {
  value: string;
  onChange?: (v: string) => void;
  language?: EditorLanguage;
  readOnly?: boolean;
  placeholder?: string;
  wrap?: boolean;
  lineNumbers?: boolean;
  ariaLabel?: string;
}) {
  const extensions = useMemo(
    () => [
      ...languageExtension(language),
      syntaxHighlighting(highlight),
      baseTheme,
      ...(wrap ? [EditorView.lineWrapping] : []),
      ...(ariaLabel ? [EditorView.contentAttributes.of({ "aria-label": ariaLabel })] : []),
    ],
    [language, wrap, ariaLabel],
  );
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      readOnly={readOnly}
      editable={!readOnly}
      placeholder={placeholder}
      theme="none"
      height="100%"
      className="h-full"
      basicSetup={{ lineNumbers, foldGutter: lineNumbers, highlightActiveLine: !readOnly, highlightActiveLineGutter: !readOnly, autocompletion: false, searchKeymap: true }}
    />
  );
}
