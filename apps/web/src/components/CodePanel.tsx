"use client";

import { buildRequest, CODEGEN_LANGUAGES, emptyScopes, findNode, generateCode, type CodegenLanguage } from "@packetman/core";
import { Check, Copy, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useWorkspace, type Tab } from "@/store/workspace";
import { CodeEditor } from "./CodeEditor";
import { useScopes } from "./hooks";
import { IconButton, Select } from "./ui";

export function CodePanel({ tab }: { tab: Extract<Tab, { kind: "request" }> }) {
  const [lang, setLang] = useState<CodegenLanguage>("curl");
  const [resolveVars, setResolveVars] = useState(false);
  const [copied, setCopied] = useState(false);
  const collection = useWorkspace((s) => (tab.collectionId ? s.collections.find((c) => c.id === tab.collectionId) : undefined));
  const { toggleCodePanel } = useWorkspace.getState();
  const scopes = useScopes(tab.collectionId);

  const code = useMemo(() => {
    const ancestors = collection && tab.requestId ? (findNode(collection, tab.requestId)?.ancestors ?? []) : [];
    const built = buildRequest(tab.draft, { scopes: resolveVars ? scopes : emptyScopes(), ancestors, collection });
    return generateCode(lang, built);
  }, [tab.draft, tab.requestId, collection, scopes, resolveVars, lang]);

  return (
    <aside aria-label="Generate kode" className="flex h-full min-h-0 flex-col border-l border-line bg-panel">
      <div className="flex h-10 items-center justify-between border-b border-line pr-1.5 pl-3">
        <h2 className="text-sm font-semibold">Kode</h2>
        <div className="flex items-center">
          <IconButton
            label="Salin kode"
            onClick={async () => {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </IconButton>
          <IconButton label="Tutup panel kode" onClick={toggleCodePanel}>
            <X size={15} />
          </IconButton>
        </div>
      </div>
      <div className="flex flex-col gap-2 border-b border-line p-3">
        <Select aria-label="Bahasa" value={lang} onChange={(e) => setLang(e.target.value as CodegenLanguage)}>
          {CODEGEN_LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" className="accent-[var(--brass)]" checked={resolveVars} onChange={(e) => setResolveVars(e.target.checked)} />
          Isi nilai variabel (termasuk secret)
        </label>
      </div>
      <div className="min-h-0 flex-1">
        <CodeEditor value={code} readOnly language={lang === "fetch" || lang === "axios" ? "javascript" : "text"} lineNumbers={false} ariaLabel="Kode hasil generate" />
      </div>
    </aside>
  );
}
