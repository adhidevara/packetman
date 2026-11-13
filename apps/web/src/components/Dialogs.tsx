"use client";

import { ShieldCheck, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useWorkspace, type ImportSummary } from "@/store/workspace";
import { Button, Dialog, Select, TextInput } from "./ui";

/* ---------------- Import ---------------- */

export function ImportDialog() {
  const open = useWorkspace((s) => s.importOpen);
  const { setImportOpen, importText, markSecrets } = useWorkspace.getState();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const close = () => {
    setImportOpen(false);
    setText("");
    setError(null);
    setSummary(null);
  };

  const run = (input: string) => {
    setError(null);
    try {
      const s = importText(input);
      if (s.kind === "curl") return close();
      setSummary(s);
      setSelected(new Set(s.secrets.map((f) => f.variableId).filter((x): x is string => !!x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onFile = async (file: File) => {
    const content = await file.text();
    setText(content.length > 200_000 ? content.slice(0, 2000) + "\n…" : content);
    run(content);
  };

  if (summary) {
    const fixable = summary.secrets.filter((f) => f.variableId);
    return (
      <Dialog
        open={open}
        onClose={close}
        title={`Impor selesai: ${summary.name}`}
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Biarkan apa adanya
            </Button>
            {fixable.length > 0 && (
              <Button
                variant="primary"
                onClick={() => {
                  markSecrets(summary, [...selected]);
                  close();
                }}
              >
                Jadikan {selected.size} variabel secret
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-4 text-sm">
          {summary.secrets.length === 0 ? (
            <p className="flex items-center gap-2 text-ok">
              <ShieldCheck size={16} /> Tidak ada kredensial yang terdeteksi.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-2 text-warn">
                <TriangleAlert size={16} /> {summary.secrets.length} nilai terlihat seperti kredensial
              </p>
              <p className="text-muted">Variabel bertipe secret tetap bisa dipakai, tapi nilainya hanya disimpan di browser ini dan tidak ikut ekspor.</p>
              <ul className="flex flex-col gap-1 rounded-md border border-line p-2">
                {summary.secrets.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    {f.variableId ? (
                      <input
                        type="checkbox"
                        className="mt-0.5 accent-[var(--brass)]"
                        checked={selected.has(f.variableId)}
                        aria-label={`Jadikan ${f.field} secret`}
                        onChange={(e) =>
                          setSelected((s) => {
                            const n = new Set(s);
                            if (e.target.checked) n.add(f.variableId!);
                            else n.delete(f.variableId!);
                            return n;
                          })
                        }
                      />
                    ) : (
                      <span className="w-[13px]" />
                    )}
                    <span>
                      <span className="font-medium">{f.field}</span> <span className="text-muted">({f.pattern})</span>
                      <br />
                      <span className="font-mono text-faint">
                        {f.location} · {f.preview}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              {summary.secrets.some((f) => !f.variableId) && <p className="text-xs text-faint">Nilai yang ditulis langsung di header/auth sebaiknya dipindah ke variabel secret secara manual.</p>}
            </div>
          )}
          {summary.warnings.length > 0 && (
            <div>
              <p className="mb-1 text-muted">Catatan konversi</p>
              <ul className="ml-4 list-disc text-xs text-muted">
                {summary.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Impor"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Batal
          </Button>
          <Button variant="primary" disabled={!text.trim()} onClick={() => run(text)}>
            Impor
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-muted">Postman Collection v2.0/v2.1, Postman Environment, atau perintah cURL. File diproses di browser ini, tidak diunggah ke mana pun.</p>
        <label className="flex cursor-pointer flex-col items-center gap-1 rounded-md border border-dashed border-line-strong px-4 py-5 text-center hover:bg-hover">
          <span className="font-medium">Pilih file JSON</span>
          <span className="text-xs text-faint">atau tempel isinya di bawah</span>
          <input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
        </label>
        <textarea
          aria-label="Teks untuk diimpor"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"curl https://api.example.com/users -H 'Authorization: Bearer …'"}
          rows={8}
          spellCheck={false}
          className="w-full resize-y rounded-[5px] border border-line bg-code p-2.5 font-mono text-xs outline-none focus:border-brass"
        />
        {error && <p className="text-xs text-err">{error}</p>}
      </div>
    </Dialog>
  );
}

/* ---------------- Relay consent ---------------- */

export function RelayConsentDialog() {
  const prompt = useWorkspace((s) => s.relayPrompt);
  const extensionVersion = useWorkspace((s) => s.extensionVersion);
  const { resolveRelayPrompt } = useWorkspace.getState();
  return (
    <Dialog open={!!prompt} onClose={() => resolveRelayPrompt("deny")} title="Browser tidak bisa mengirim request ini" width={520}>
      <div className="flex flex-col gap-4 text-sm">
        <p className="text-muted">
          Server <span className="font-mono text-text">{prompt?.host}</span> menolak request dari browser (biasanya karena CORS). Pilih cara mengirimnya:
        </p>
        <div className="flex flex-col gap-2">
          <div className="rounded-md border border-line p-3">
            <p className="font-medium">Pasang Packetman Interceptor (disarankan)</p>
            <p className="mt-0.5 text-xs text-muted">
              Extension mengirim request langsung dari browsermu. Data tidak melewati server mana pun. {extensionVersion ? "" : "Lihat folder apps/extension di repo untuk memasangnya."}
            </p>
          </div>
          <div className="rounded-md border border-line p-3">
            <p className="font-medium">Kirim lewat Packetman Relay</p>
            <p className="mt-0.5 text-xs text-muted">Request (URL, header, body) melewati server relay. Relay tidak menyimpan atau mencatat isinya, dan tercatat di Egress Monitor.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => resolveRelayPrompt("once")}>
                Kirim sekali lewat relay
              </Button>
              <Button variant="ghost" onClick={() => resolveRelayPrompt("always")}>
                Selalu izinkan untuk {prompt?.host}
              </Button>
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <Button variant="ghost" data-autofocus onClick={() => resolveRelayPrompt("deny")}>
            Batalkan request
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/* ---------------- Save to collection ---------------- */

export function SaveDialog() {
  const tabId = useWorkspace((s) => s.saveDialogTabId);
  const tab = useWorkspace((s) => s.tabs.find((t) => t.id === s.saveDialogTabId));
  const collections = useWorkspace((s) => s.collections);
  const { saveTab, setSaveDialog, createCollection } = useWorkspace.getState();
  const [name, setName] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const defaultName = tab?.kind === "request" ? tab.draft.name : "";
  const target = collectionId || collections[0]?.id || "";
  return (
    <Dialog
      open={!!tabId}
      onClose={() => setSaveDialog(null)}
      title="Simpan request"
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={() => setSaveDialog(null)}>
            Batal
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              const cid = target || createCollection("Koleksi saya");
              if (tabId) saveTab(tabId, { collectionId: cid, name: name || defaultName });
              setName("");
            }}
          >
            Simpan
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-muted">Nama</span>
          <TextInput value={name} placeholder={defaultName} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">Koleksi</span>
          {collections.length ? (
            <Select value={target} onChange={(e) => setCollectionId(e.target.value)}>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          ) : (
            <span className="text-xs text-faint">Belum ada koleksi. Koleksi baru akan dibuat.</span>
          )}
        </label>
      </div>
    </Dialog>
  );
}
