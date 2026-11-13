"use client";

import { detectSecret, newVariable, type Variable } from "@packetman/core";
import { Eye, EyeOff, Lock, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { cx, IconButton } from "./ui";

/**
 * Variables with initial value (shareable) and current value (local only).
 * Secret variables are masked and never exported.
 */
export function VariablesTable({ vars, onChange }: { vars: Variable[]; onChange: (v: Variable[]) => void }) {
  const [reveal, setReveal] = useState<Set<string>>(new Set());
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const update = (id: string, patch: Partial<Variable>) => onChange(vars.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  const toggleReveal = (id: string) =>
    setReveal((r) => {
      const n = new Set(r);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const cell = "h-8 w-full min-w-0 bg-transparent px-2.5 font-mono text-xs outline-none placeholder:text-faint focus:bg-hover/60";
  const cols = "grid-cols-[28px_minmax(0,1fr)_92px_minmax(0,1.3fr)_minmax(0,1.3fr)_56px]";

  return (
    <div className="overflow-hidden rounded-[5px] border border-line">
      <div className={cx("grid border-b border-line bg-raised text-2xs text-muted", cols)}>
        <span />
        <span className="px-2.5 py-1.5">Variabel</span>
        <span className="border-l border-line px-2.5 py-1.5">Tipe</span>
        <span className="border-l border-line px-2.5 py-1.5" title="Dibagikan ke tim dan ikut ekspor (kecuali secret)">
          Nilai awal
        </span>
        <span className="border-l border-line px-2.5 py-1.5" title="Hanya di browser ini. Tidak pernah ikut sync atau ekspor.">
          Nilai saat ini (lokal)
        </span>
        <span />
      </div>
      {vars.map((v) => {
        const hidden = v.type === "secret" && !reveal.has(v.id);
        const leak = v.type !== "secret" ? detectSecret(v.value) : undefined;
        return (
          <div key={v.id} className={cx("group grid border-b border-line last:border-b-0", cols, !v.enabled && "opacity-50")}>
            <label className="grid place-items-center">
              <input type="checkbox" className="accent-[var(--brass)]" checked={v.enabled} onChange={(e) => update(v.id, { enabled: e.target.checked })} aria-label={`Aktifkan ${v.key}`} />
            </label>
            <div className="flex items-center">
              <input className={cell} value={v.key} autoFocus={pendingFocus === v.id} onChange={(e) => update(v.id, { key: e.target.value })} aria-label="Nama variabel" />
              {leak && (
                <span title={`Terdeteksi ${leak.label}. Ubah tipe ke secret agar tidak ikut ekspor.`} className="pr-1.5 text-warn">
                  <TriangleAlert size={13} />
                </span>
              )}
            </div>
            <select
              aria-label="Tipe variabel"
              value={v.type}
              onChange={(e) => update(v.id, { type: e.target.value as Variable["type"] })}
              className="h-8 border-l border-line bg-transparent px-2 text-xs outline-none"
            >
              <option value="default" className="bg-panel">
                default
              </option>
              <option value="secret" className="bg-panel">
                secret
              </option>
            </select>
            <input
              className={cx(cell, "border-l border-line")}
              type={hidden ? "password" : "text"}
              value={v.value}
              onChange={(e) => update(v.id, { value: e.target.value })}
              aria-label="Nilai awal"
            />
            <input
              className={cx(cell, "border-l border-line")}
              type={hidden ? "password" : "text"}
              value={v.currentValue ?? ""}
              placeholder={v.value ? "sama dengan nilai awal" : ""}
              onChange={(e) => update(v.id, { currentValue: e.target.value })}
              aria-label="Nilai saat ini"
            />
            <div className="flex items-center justify-center">
              {v.type === "secret" ? (
                <IconButton label={hidden ? "Tampilkan nilai" : "Sembunyikan nilai"} className="size-6" onClick={() => toggleReveal(v.id)}>
                  {hidden ? <Eye size={13} /> : <EyeOff size={13} />}
                </IconButton>
              ) : (
                <span className="size-6" />
              )}
              <IconButton label="Hapus variabel" className="size-6 opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => onChange(vars.filter((x) => x.id !== v.id))}>
                <Trash2 size={13} />
              </IconButton>
            </div>
          </div>
        );
      })}
      <div className={cx("grid", cols)}>
        <span />
        <input
          className={cell}
          value=""
          placeholder="Tambah variabel"
          aria-label="Variabel baru"
          onChange={(e) => {
            const nv = newVariable(e.target.value);
            setPendingFocus(nv.id);
            onChange([...vars, nv]);
          }}
        />
        <span className="border-l border-line" />
        <span className="border-l border-line" />
        <span className="border-l border-line" />
        <span />
      </div>
      <p className="flex items-center gap-1.5 border-t border-line bg-raised px-3 py-1.5 text-2xs text-faint">
        <Lock size={11} /> Nilai saat ini dan semua nilai secret hanya disimpan di browser ini.
      </p>
    </div>
  );
}
