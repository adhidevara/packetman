"use client";

import { findNode, findVariableTokens, HTTP_METHODS, importCurl, looksLikeCurl, paramsFromUrl, urlWithParams, type RequestData } from "@packetman/core";
import { Code2, Loader2, Save, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { useWorkspace, type Tab } from "@/store/workspace";
import { AuthEditor } from "./AuthEditor";
import { BodyEditor } from "./BodyEditor";
import { useScopes } from "./hooks";
import { KeyValueEditor } from "./KeyValueEditor";
import { ScriptsEditor } from "./ScriptsEditor";
import { Button, cx, IconButton, SubTabs, TextInput } from "./ui";
import { VariableInput } from "./VariableInput";

type RequestTabId = "params" | "auth" | "headers" | "body" | "scripts" | "settings";

export function RequestPane({ tab }: { tab: Extract<Tab, { kind: "request" }> }) {
  const updateDraft = useWorkspace((s) => s.updateDraft);
  const send = useWorkspace((s) => s.send);
  const saveTab = useWorkspace((s) => s.saveTab);
  const toggleCode = useWorkspace((s) => s.toggleCodePanel);
  const codeOpen = useWorkspace((s) => s.codePanelOpen);
  const loading = useWorkspace((s) => s.runs[tab.id]?.loading ?? false);
  const collection = useWorkspace((s) => (tab.collectionId ? s.collections.find((c) => c.id === tab.collectionId) : undefined));
  const scopes = useScopes(tab.collectionId);
  const [sub, setSub] = useState<RequestTabId>("params");
  const d = tab.draft;
  const patch = (p: Partial<RequestData>) => updateDraft(tab.id, p);

  const inheritedFrom = useMemo(() => {
    if (!collection || !tab.requestId) return undefined;
    const loc = findNode(collection, tab.requestId);
    const folder = loc?.ancestors.slice().reverse().find((f) => f.auth.type !== "inherit");
    return folder ? `folder "${folder.name}"` : `koleksi "${collection.name}"`;
  }, [collection, tab.requestId]);

  const missing = useMemo(() => {
    const all = [d.url, ...d.headers.filter((h) => h.enabled).map((h) => h.value), d.body.mode === "raw" ? d.body.raw : ""].join("\n");
    return [...new Set(findVariableTokens(all, scopes).filter((t) => !t.defined).map((t) => t.name))];
  }, [d, scopes]);

  const enabledCount = (rows: { enabled: boolean; key: string }[]) => rows.filter((r) => r.enabled && r.key).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 px-4 pt-3">
        <input
          aria-label="Nama request"
          value={d.name}
          onChange={(e) => patch({ name: e.target.value })}
          className="min-w-0 flex-1 rounded-[5px] bg-transparent px-1 py-0.5 text-base font-semibold outline-none hover:bg-hover focus:bg-hover"
        />
        {tab.dirty && <span className="text-xs text-faint">Belum disimpan</span>}
        <Button variant="ghost" onClick={() => saveTab(tab.id)} title="Simpan (Ctrl+S)">
          <Save size={14} /> Simpan
        </Button>
        <IconButton label="Generate kode" onClick={toggleCode} className={cx(codeOpen && "bg-hover text-text")}>
          <Code2 size={16} />
        </IconButton>
      </div>

      <form
        className="flex items-stretch gap-2 px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(tab.id);
        }}
      >
        <div className="flex h-10 min-w-0 flex-1 items-stretch overflow-hidden rounded-md border border-line-strong bg-raised focus-within:border-brass">
          <select
            aria-label="Method"
            value={d.method}
            onChange={(e) => patch({ method: e.target.value })}
            className={cx(`method-${d.method}`, "w-28 shrink-0 border-r border-line bg-transparent px-3 font-mono text-sm font-semibold outline-none")}
          >
            {HTTP_METHODS.map((m) => (
              <option key={m} value={m} className="bg-panel text-text">
                {m}
              </option>
            ))}
          </select>
          <VariableInput
            ariaLabel="URL"
            value={d.url}
            scopes={scopes}
            placeholder="https://api.example.com/users atau tempel perintah cURL"
            onChange={(url) => {
              if (looksLikeCurl(url)) {
                try {
                  const { id: _id, type: _type, name: _name, ...imported } = importCurl(url);
                  patch(imported);
                  return;
                } catch {
                  /* not a complete curl command yet: keep typing */
                }
              }
              patch({ url, params: paramsFromUrl(url, d.params) });
            }}
          />
        </div>
        <Button type="submit" variant="primary" className="h-10 px-5 text-base" disabled={loading} title="Kirim (Ctrl+Enter)">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
          Kirim
        </Button>
      </form>

      {missing.length > 0 && (
        <p className="-mt-1 px-4 pb-2 text-xs text-err">
          Variabel belum didefinisikan: {missing.map((m) => `{{${m}}}`).join(", ")}. Tambahkan di environment atau variabel koleksi.
        </p>
      )}

      <SubTabs<RequestTabId>
        value={sub}
        onChange={setSub}
        tabs={[
          { id: "params", label: "Params", count: enabledCount(d.params) },
          { id: "auth", label: "Auth", marker: d.auth.type !== "inherit" && d.auth.type !== "none" ? "dot" : undefined },
          { id: "headers", label: "Headers", count: enabledCount(d.headers) },
          { id: "body", label: "Body", marker: d.body.mode !== "none" ? "dot" : undefined },
          { id: "scripts", label: "Scripts", marker: d.scripts.preRequest.trim() || d.scripts.postResponse.trim() ? "dot" : undefined },
          { id: "settings", label: "Pengaturan" },
        ]}
      />

      <div className="min-h-0 flex-1 overflow-auto">
        {sub === "params" && (
          <div className="p-4">
            <KeyValueEditor rows={d.params} onChange={(params) => patch({ params, url: urlWithParams(d.url, params) })} keyPlaceholder="Param" />
          </div>
        )}
        {sub === "auth" && <AuthEditor auth={d.auth} onChange={(auth) => patch({ auth })} inheritedFrom={inheritedFrom} />}
        {sub === "headers" && (
          <div className="p-4">
            <KeyValueEditor rows={d.headers} onChange={(headers) => patch({ headers })} keyPlaceholder="Header" />
            <p className="mt-2 text-xs text-faint">Content-Type dan Authorization ditambahkan otomatis dari tab Body dan Auth bila belum diisi di sini.</p>
          </div>
        )}
        {sub === "body" && <BodyEditor body={d.body} onChange={(body) => patch({ body })} />}
        {sub === "scripts" && <ScriptsEditor scripts={d.scripts} onChange={(scripts) => patch({ scripts })} />}
        {sub === "settings" && (
          <div className="flex flex-col gap-4 p-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-[var(--brass)]" checked={d.settings.followRedirects} onChange={(e) => patch({ settings: { ...d.settings, followRedirects: e.target.checked } })} />
              Ikuti redirect otomatis
            </label>
            <label className="grid max-w-md grid-cols-[160px_1fr] items-center gap-3 text-sm">
              <span className="text-muted">Timeout (ms)</span>
              <TextInput
                type="number"
                min={1000}
                step={1000}
                value={d.settings.timeoutMs}
                onChange={(e) => patch({ settings: { ...d.settings, timeoutMs: Math.max(1000, Number(e.target.value) || 30000) } })}
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
