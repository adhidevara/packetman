"use client";

import type { Scripts } from "@packetman/core";
import { useState } from "react";
import { CodeEditor } from "./CodeEditor";
import { cx } from "./ui";

const SNIPPETS: Record<keyof Scripts, { label: string; code: string }[]> = {
  preRequest: [
    { label: "Set variabel lokal", code: 'pm.variables.set("key", "value");' },
    { label: "Tambah header", code: 'pm.request.headers.upsert({ key: "X-Request-Time", value: Date.now() });' },
    { label: "Timestamp ke environment", code: 'pm.environment.set("timestamp", new Date().toISOString());' },
    { label: "Log URL", code: 'console.log("URL:", pm.request.url.toString());' },
  ],
  postResponse: [
    { label: "Status 200", code: 'pm.test("Status 200", () => {\n  pm.response.to.have.status(200);\n});' },
    { label: "Waktu respons < 500 ms", code: 'pm.test("Respons di bawah 500 ms", () => {\n  pm.expect(pm.response.responseTime).to.be.below(500);\n});' },
    { label: "Cek field JSON", code: 'pm.test("Punya field id", () => {\n  const json = pm.response.json();\n  pm.expect(json).to.have.property("id");\n});' },
    { label: "Simpan token ke environment", code: 'const json = pm.response.json();\npm.environment.set("token", json.token);' },
    { label: "Header Content-Type", code: 'pm.test("Content-Type JSON", () => {\n  pm.response.to.have.header("Content-Type");\n  pm.expect(pm.response.headers.get("Content-Type")).to.include("json");\n});' },
  ],
};

export function ScriptsEditor({ scripts, onChange }: { scripts: Scripts; onChange: (s: Scripts) => void }) {
  const [which, setWhich] = useState<keyof Scripts>("postResponse");
  const insert = (code: string) => {
    const current = scripts[which];
    onChange({ ...scripts, [which]: current.trim() ? `${current.replace(/\s+$/, "")}\n\n${code}` : code });
  };
  return (
    <div className="grid h-full min-h-0 grid-cols-[150px_1fr_200px]">
      <nav aria-label="Jenis script" className="flex flex-col gap-0.5 border-r border-line p-2">
        {(["preRequest", "postResponse"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setWhich(k)}
            className={cx("flex items-center justify-between rounded-[5px] px-2 py-1.5 text-left text-sm", which === k ? "bg-hover text-text" : "text-muted hover:text-text")}
          >
            {k === "preRequest" ? "Pre-request" : "Post-response"}
            {scripts[k].trim() && <span className="size-1.5 rounded-full bg-brass" />}
          </button>
        ))}
        <p className="mt-auto px-2 pb-1 text-2xs leading-snug text-faint">Script jalan di sandbox QuickJS: tanpa akses jaringan, DOM, atau penyimpanan.</p>
      </nav>
      <div className="min-h-0 overflow-hidden">
        <CodeEditor
          key={which}
          value={scripts[which]}
          onChange={(v) => onChange({ ...scripts, [which]: v })}
          language="javascript"
          placeholder={which === "preRequest" ? "// Jalan sebelum request dikirim" : "// Jalan setelah response diterima. Tulis pm.test(...) di sini."}
          ariaLabel={which === "preRequest" ? "Pre-request script" : "Post-response script"}
        />
      </div>
      <aside aria-label="Snippet" className="flex min-h-0 flex-col gap-0.5 overflow-auto border-l border-line p-2">
        <p className="px-2 pb-1 text-xs text-muted">Snippet</p>
        {SNIPPETS[which].map((s) => (
          <button key={s.label} type="button" onClick={() => insert(s.code)} className="rounded-[5px] px-2 py-1.5 text-left text-xs text-info hover:bg-hover">
            {s.label}
          </button>
        ))}
      </aside>
    </div>
  );
}
