"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type InputHTMLAttributes } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "ghost" | "outline" | "danger";

export function Button({ variant = "outline", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "inline-flex h-8 items-center gap-1.5 rounded-[5px] px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-brass text-brass-ink hover:bg-brass-strong",
        variant === "outline" && "border border-line-strong bg-raised text-text hover:bg-hover",
        variant === "ghost" && "text-muted hover:bg-hover hover:text-text",
        variant === "danger" && "border border-err/40 text-err hover:bg-err/10",
        className,
      )}
    />
  );
}

export function IconButton({ label, className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={cx("inline-grid size-7 place-items-center rounded-[5px] text-muted transition-colors hover:bg-hover hover:text-text disabled:opacity-40", className)}
    >
      {children}
    </button>
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx("h-8 rounded-[5px] border border-line bg-raised px-2 text-sm text-text outline-none hover:border-line-strong focus:border-brass", className)}
    >
      {children}
    </select>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx("h-8 w-full rounded-[5px] border border-line bg-raised px-2.5 text-sm text-text outline-none placeholder:text-faint hover:border-line-strong focus:border-brass", className)}
    />
  );
}

export interface SubTab<T extends string> {
  id: T;
  label: string;
  count?: number;
  marker?: "ok" | "err" | "dot";
}

export function SubTabs<T extends string>({ tabs, value, onChange, className, right }: { tabs: SubTab<T>[]; value: T; onChange: (v: T) => void; className?: string; right?: ReactNode }) {
  return (
    <div className={cx("flex items-center gap-1 border-b border-line px-3", className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            "relative -mb-px flex h-9 items-center gap-1.5 border-b-2 px-2 text-sm transition-colors",
            value === t.id ? "border-brass text-text" : "border-transparent text-muted hover:text-text",
          )}
        >
          {t.label}
          {t.count !== undefined && t.count > 0 && <span className="text-2xs text-faint">{t.count}</span>}
          {t.marker === "dot" && <span className="size-1.5 rounded-full bg-brass" />}
          {t.marker === "ok" && <span className="size-1.5 rounded-full bg-ok" />}
          {t.marker === "err" && <span className="size-1.5 rounded-full bg-err" />}
        </button>
      ))}
      {right && <div className="ml-auto flex items-center gap-1">{right}</div>}
    </div>
  );
}

export function Dialog({ open, onClose, title, children, footer, width = 560 }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("input, textarea, select, button[data-autofocus]")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="flex max-h-[85vh] w-full flex-col rounded-lg border border-line-strong bg-panel shadow-2xl" style={{ maxWidth: width }}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <IconButton label="Tutup" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-4 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function MethodLabel({ method, className }: { method: string; className?: string }) {
  const m = method.toUpperCase();
  const short = m === "DELETE" ? "DEL" : m === "OPTIONS" ? "OPT" : m === "PATCH" ? "PTCH" : m;
  return <span className={cx(`method-${m}`, "inline-block w-9 shrink-0 font-mono text-2xs font-semibold", className)}>{short}</span>;
}

export function statusTone(status?: number): string {
  if (!status) return "text-err";
  if (status < 300) return "text-ok";
  if (status < 400) return "text-info";
  if (status < 500) return "text-warn";
  return "text-err";
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <p className="text-sm font-medium text-text">{title}</p>
      {children && <div className="max-w-sm text-xs text-muted">{children}</div>}
    </div>
  );
}
