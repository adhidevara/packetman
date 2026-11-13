"use client";

import { findVariableTokens, type VariableScopes } from "@packetman/core";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { cx } from "./ui";

/**
 * Single-line input that colors {{variables}}: defined ones in green,
 * missing ones in red. A transparent input sits on top of a highlighted mirror.
 */
export function VariableInput({
  value,
  onChange,
  scopes,
  placeholder,
  className,
  onKeyDown,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  scopes: VariableScopes;
  placeholder?: string;
  className?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  ariaLabel?: string;
}) {
  const [scroll, setScroll] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const parts = useMemo(() => {
    const tokens = findVariableTokens(value, scopes);
    const out: { text: string; cls?: string; title?: string }[] = [];
    let at = 0;
    for (const t of tokens) {
      if (t.start > at) out.push({ text: value.slice(at, t.start) });
      out.push({
        text: value.slice(t.start, t.end),
        cls: t.defined ? "var-ok" : "var-missing",
        title: t.defined ? `${t.name} · ${t.scope}` : `${t.name} belum didefinisikan`,
      });
      at = t.end;
    }
    if (at < value.length) out.push({ text: value.slice(at) });
    return out;
  }, [value, scopes]);

  return (
    <div className={cx("relative min-w-0 flex-1 overflow-hidden", className)}>
      <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre px-3 font-mono text-sm">
        <span style={{ transform: `translateX(${-scroll}px)` }}>
          {parts.map((p, i) => (
            <span key={i} className={p.cls}>
              {p.text}
            </span>
          ))}
        </span>
      </div>
      <input
        ref={inputRef}
        value={value}
        spellCheck={false}
        autoComplete="off"
        aria-label={ariaLabel}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => setScroll(e.currentTarget.scrollLeft)}
        onSelect={(e) => setScroll(e.currentTarget.scrollLeft)}
        onKeyDown={onKeyDown}
        className="relative h-full w-full bg-transparent px-3 font-mono text-sm text-transparent caret-[var(--text)] outline-none placeholder:text-faint selection:text-transparent"
      />
    </div>
  );
}
