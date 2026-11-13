"use client";

import { Check, Copy, Download, Loader2, ShieldAlert, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useWorkspace, type Tab } from "@/store/workspace";
import { CodeEditor, type EditorLanguage } from "./CodeEditor";
import { cx, EmptyState, formatBytes, IconButton, statusTone, SubTabs } from "./ui";

type ResponseTabId = "body" | "headers" | "tests" | "console" | "sent";
type BodyView = "pretty" | "raw" | "preview";

function detectLanguage(contentType: string, body: string): EditorLanguage {
  const ct = contentType.toLowerCase();
  if (ct.includes("json")) return "json";
  if (ct.includes("html")) return "html";
  if (ct.includes("xml")) return "xml";
  if (ct.includes("javascript")) return "javascript";
  const t = body.trimStart();
  if (t.startsWith("{") || t.startsWith("[")) return "json";
  if (t.startsWith("<")) return "xml";
  return "text";
}

function pretty(body: string, lang: EditorLanguage): string {
  if (lang !== "json") return body;
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

const EXECUTOR_LABEL: Record<string, string> = { direct: "Browser langsung", extension: "Extension", relay: "Relay" };

// HTTP/2 responses carry no reason phrase; show the standard one.
const REASON: Record<number, string> = {
  200: "OK", 201: "Created", 202: "Accepted", 204: "No Content", 301: "Moved Permanently", 302: "Found", 304: "Not Modified",
  307: "Temporary Redirect", 308: "Permanent Redirect", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found",
  405: "Method Not Allowed", 409: "Conflict", 422: "Unprocessable Content", 429: "Too Many Requests", 500: "Internal Server Error",
  502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout",
};

export function ResponsePane({ tab }: { tab: Extract<Tab, { kind: "request" }> }) {
  const run = useWorkspace((s) => s.runs[tab.id]);
  const [sub, setSub] = useState<ResponseTabId>("body");
  const [view, setView] = useState<BodyView>("pretty");
  const [copied, setCopied] = useState(false);
  const result = run?.result;
  const res = result?.response;

  const contentType = res?.headers.find(([k]) => k.toLowerCase() === "content-type")?.[1] ?? "";
  const lang = useMemo(() => (res ? detectLanguage(contentType, res.body) : "text"), [res, contentType]);
  const prettyBody = useMemo(() => (res ? pretty(res.body, lang) : ""), [res, lang]);

  if (!run) {
    return (
      <EmptyState title="Belum ada response">
        Tekan <kbd className="rounded border border-line px-1 font-mono">Ctrl</kbd>+<kbd className="rounded border border-line px-1 font-mono">Enter</kbd> atau tombol Kirim. Request dikirim langsung dari browser ini.
      </EmptyState>
    );
  }
  if (run.loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> Mengirim request…
      </div>
    );
  }
  if (!result) return null;

  const passed = result.tests.filter((t) => t.passed && !t.skipped).length;
  const failed = result.tests.filter((t) => !t.passed).length;

  const copy = async () => {
    await navigator.clipboard.writeText(view === "raw" ? (res?.body ?? "") : prettyBody);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  const download = () => {
    if (!res) return;
    const blob = new Blob([res.body], { type: contentType || "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `response-${res.status}.${lang === "json" ? "json" : lang === "html" ? "html" : lang === "xml" ? "xml" : "txt"}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SubTabs<ResponseTabId>
        value={sub}
        onChange={setSub}
        tabs={[
          { id: "body", label: "Body" },
          { id: "headers", label: "Headers", count: res?.headers.length },
          { id: "tests", label: "Tests", count: result.tests.length, marker: result.tests.length ? (failed ? "err" : "ok") : undefined },
          { id: "console", label: "Log", count: result.logs.length },
          { id: "sent", label: "Terkirim" },
        ]}
        right={
          res ? (
            <div className="flex items-center gap-3 text-xs">
              <span className={cx("font-mono font-semibold", statusTone(res.status))}>
                {res.status} {res.statusText || REASON[res.status] || ""}
              </span>
              <span className="font-mono text-muted">{res.timings.total} ms</span>
              <span className="font-mono text-muted">{formatBytes(res.size)}</span>
              <span className="rounded-[4px] border border-line px-1.5 py-0.5 text-2xs text-muted" title="Jalur pengiriman">
                {EXECUTOR_LABEL[res.executor] ?? res.executor}
              </span>
            </div>
          ) : null
        }
      />

      {!res && (
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-start gap-2 rounded-md border border-err/40 bg-err/5 p-3 text-sm">
            <ShieldAlert size={16} className="mt-0.5 shrink-0 text-err" />
            <div className="flex flex-col gap-1">
              <p className="font-medium text-err">{result.aborted ? "Request tidak dikirim" : result.skipped ? "Request dilewati oleh script" : "Request gagal"}</p>
              <p className="text-muted">{result.error ?? result.logs.at(-1)?.args.join(" ") ?? "Tidak ada detail."}</p>
            </div>
          </div>
          {result.tests.length > 0 && <TestList tests={result.tests} />}
        </div>
      )}

      {res && sub === "body" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-1 px-3 py-1.5">
            {(["pretty", "raw", "preview"] as BodyView[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cx("rounded-[4px] px-2 py-1 text-xs", view === v ? "bg-hover text-text" : "text-muted hover:text-text")}
              >
                {v === "pretty" ? "Pretty" : v === "raw" ? "Raw" : "Preview"}
              </button>
            ))}
            <span className="ml-2 text-2xs text-faint">{contentType || "tanpa content-type"}</span>
            <div className="ml-auto flex items-center">
              <IconButton label="Salin body" onClick={copy}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </IconButton>
              <IconButton label="Unduh body" onClick={download}>
                <Download size={14} />
              </IconButton>
            </div>
          </div>
          {res.notes && res.notes.length > 0 && (
            <ul className="mx-3 mb-1.5 flex flex-col gap-0.5 text-2xs text-faint">
              {res.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <div className="min-h-0 flex-1 border-t border-line">
            {view === "pretty" && <CodeEditor value={prettyBody} language={lang} readOnly ariaLabel="Body response" />}
            {view === "raw" && <CodeEditor value={res.body} language="text" readOnly ariaLabel="Body response mentah" />}
            {view === "preview" &&
              (lang === "html" ? (
                <iframe title="Preview response" sandbox="" srcDoc={res.body} className="h-full w-full bg-white" />
              ) : (
                <div className="h-full overflow-auto p-4 font-mono text-xs whitespace-pre-wrap">{prettyBody}</div>
              ))}
          </div>
        </div>
      )}

      {res && sub === "headers" && (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <table className="w-full border-collapse font-mono text-xs">
            <tbody>
              {res.headers.map(([k, v], i) => (
                <tr key={`${k}-${i}`} className="border-b border-line align-top">
                  <td className="w-1/3 py-1.5 pr-4 text-muted">{k}</td>
                  <td className="py-1.5 break-all">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {res && sub === "tests" && (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {result.tests.length === 0 ? (
            <p className="text-sm text-muted">Belum ada test. Tambahkan pm.test(...) di tab Scripts → Post-response.</p>
          ) : (
            <>
              <p className="mb-3 text-xs text-muted">
                {passed} lulus · {failed} gagal
              </p>
              <TestList tests={result.tests} />
            </>
          )}
          {result.scripts.some((s) => s.error) && (
            <ul className="mt-4 flex flex-col gap-1 text-xs text-err">
              {result.scripts
                .filter((s) => s.error)
                .map((s, i) => (
                  <li key={i}>
                    Script {s.event === "prerequest" ? "pre-request" : "post-response"} ({s.level}: {s.name}): {s.error}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {sub === "console" && res && (
        <div className="min-h-0 flex-1 overflow-auto p-2 font-mono text-xs">
          {result.logs.length === 0 && <p className="p-2 font-sans text-sm text-muted">Script tidak menulis log. Pakai console.log(...) di script.</p>}
          {result.logs.map((l, i) => (
            <div key={i} className={cx("border-b border-line px-2 py-1 whitespace-pre-wrap", l.level === "error" && "text-err", l.level === "warn" && "text-warn")}>
              {l.args.join(" ")}
            </div>
          ))}
        </div>
      )}

      {sub === "sent" && res && result.resolved && (
        <div className="min-h-0 flex-1 overflow-auto p-4 font-mono text-xs">
          <p className="mb-2 break-all">
            <span className={`method-${result.resolved.method} font-semibold`}>{result.resolved.method}</span> {result.resolved.url}
          </p>
          <table className="w-full border-collapse">
            <tbody>
              {result.resolved.headers.map(([k, v], i) => (
                <tr key={i} className="border-b border-line align-top">
                  <td className="w-1/3 py-1.5 pr-4 text-muted">{k}</td>
                  <td className="py-1.5 break-all">{/authorization|token|key|secret|cookie/i.test(k) ? `${v.slice(0, 10)}…` : v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.resolved.body.kind === "text" && <pre className="mt-3 rounded-[5px] border border-line bg-code p-3 whitespace-pre-wrap">{result.resolved.body.text}</pre>}
          <p className="mt-3 font-sans text-2xs text-faint">Nilai header sensitif dipotong di tampilan ini. Request asli dikirim lengkap.</p>
        </div>
      )}
    </div>
  );
}

function TestList({ tests }: { tests: { name: string; passed: boolean; error: string | null; skipped: boolean }[] }) {
  return (
    <ul className="flex flex-col gap-1">
      {tests.map((t, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          {t.skipped ? (
            <span className="mt-0.5 w-12 shrink-0 text-2xs text-faint">skip</span>
          ) : t.passed ? (
            <span className="mt-0.5 flex w-12 shrink-0 items-center gap-1 text-2xs text-ok">
              <Check size={12} /> lulus
            </span>
          ) : (
            <span className="mt-0.5 flex w-12 shrink-0 items-center gap-1 text-2xs text-err">
              <X size={12} /> gagal
            </span>
          )}
          <div className="min-w-0">
            <p>{t.name}</p>
            {t.error && <p className="font-mono text-xs text-err">{t.error}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}
