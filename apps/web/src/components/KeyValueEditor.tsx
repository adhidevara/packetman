"use client";

import { newKeyValue, type KeyValue } from "@packetman/core";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { cx, IconButton } from "./ui";

/**
 * Table editor for params, headers and form fields. Always keeps one empty
 * row at the bottom; typing into it creates a new entry.
 */
export function KeyValueEditor({
  rows,
  onChange,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
  showDescription = true,
}: {
  rows: KeyValue[];
  onChange: (rows: KeyValue[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  showDescription?: boolean;
}) {
  const [pendingFocus, setPendingFocus] = useState<{ id: string; field: "key" | "value" } | null>(null);
  const update = (id: string, patch: Partial<KeyValue>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => onChange(rows.filter((r) => r.id !== id));
  const addFrom = (patch: Partial<KeyValue>, field: "key" | "value") => {
    const row = { ...newKeyValue(), ...patch };
    setPendingFocus({ id: row.id, field });
    onChange([...rows, row]);
  };

  const cell = "h-8 w-full bg-transparent px-2.5 font-mono text-xs outline-none placeholder:text-faint focus:bg-hover/60";
  const cols = showDescription ? "grid-cols-[28px_1fr_1.4fr_1fr_32px]" : "grid-cols-[28px_1fr_1.6fr_32px]";

  return (
    <div className="overflow-hidden rounded-[5px] border border-line">
      <div className={cx("grid border-b border-line bg-raised text-2xs text-muted", cols)}>
        <span />
        <span className="px-2.5 py-1.5">Key</span>
        <span className="border-l border-line px-2.5 py-1.5">Value</span>
        {showDescription && <span className="border-l border-line px-2.5 py-1.5">Keterangan</span>}
        <span />
      </div>
      {rows.map((r) => (
        <div key={r.id} className={cx("group grid border-b border-line last:border-b-0", cols, !r.enabled && "opacity-50")}>
          <label className="grid place-items-center">
            <input type="checkbox" checked={r.enabled} onChange={(e) => update(r.id, { enabled: e.target.checked })} aria-label={`Aktifkan ${r.key || "baris"}`} className="accent-[var(--brass)]" />
          </label>
          <input className={cell} value={r.key} placeholder={keyPlaceholder} autoFocus={pendingFocus?.id === r.id && pendingFocus.field === "key"} onChange={(e) => update(r.id, { key: e.target.value })} aria-label="Key" />
          <input className={cx(cell, "border-l border-line")} value={r.value} placeholder={valuePlaceholder} autoFocus={pendingFocus?.id === r.id && pendingFocus.field === "value"} onChange={(e) => update(r.id, { value: e.target.value })} aria-label="Value" />
          {showDescription && (
            <input className={cx(cell, "border-l border-line font-sans")} value={r.description ?? ""} placeholder="" onChange={(e) => update(r.id, { description: e.target.value })} aria-label="Keterangan" />
          )}
          <div className="grid place-items-center">
            <IconButton label="Hapus baris" className="opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => remove(r.id)}>
              <Trash2 size={13} />
            </IconButton>
          </div>
        </div>
      ))}
      <div className={cx("grid", cols)}>
        <span />
        <input className={cell} value="" placeholder={`Tambah ${keyPlaceholder.toLowerCase()}`} onChange={(e) => addFrom({ key: e.target.value }, "key")} aria-label="Key baru" />
        <input className={cx(cell, "border-l border-line")} value="" placeholder={valuePlaceholder} onChange={(e) => addFrom({ value: e.target.value }, "value")} aria-label="Value baru" />
        {showDescription && <span className="border-l border-line" />}
        <span />
      </div>
    </div>
  );
}
