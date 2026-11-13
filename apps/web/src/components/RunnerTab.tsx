"use client";

import { findNode, parseDataFile, type DataFile } from "@packetman/core";
import { runnerPlan, toJUnit, type RunnerItemResult } from "@packetman/runtime";
import { Check, ChevronDown, ChevronRight, Download, Play, Square, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useWorkspace } from "@/store/workspace";
import { Button, cx, EmptyState, IconButton, MethodLabel, statusTone, TextInput } from "./ui";

function download(name: string, content: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

type Filter = "all" | "passed" | "failed";

export function RunnerTab({ tabId, collectionId, folderId }: { tabId: string; collectionId: string; folderId?: string }) {
  const collection = useWorkspace((s) => s.collections.find((c) => c.id === collectionId));
  const runner = useWorkspace((s) => s.runners[tabId]);
  const envName = useWorkspace((s) => s.environments.find((e) => e.id === s.activeEnvId)?.name);
  const { startRunner, stopRunner } = useWorkspace.getState();

  const plan = useMemo(() => {
    if (!collection) return [];
    try {
      return runnerPlan(collection, folderId);
    } catch {
      return [];
    }
  }, [collection, folderId]);

  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [iterations, setIterations] = useState(1);
  const [delayMs, setDelayMs] = useState(0);
  const [stopOnError, setStopOnError] = useState(false);
  const [persistVariables, setPersistVariables] = useState(true);
  const [data, setData] = useState<(DataFile & { name: string }) | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  if (!collection) return <EmptyState title="Koleksi tidak ditemukan" />;
  const folderName = folderId ? (findNode(collection, folderId)?.node.name ?? "Folder") : null;
  const selected = plan.filter((p) => !excluded.has(p.request.id));
  const running = runner?.running ?? false;
  const items = runner?.items ?? [];
  const summary = runner?.summary;

  const onFile = async (file: File) => {
    setDataError(null);
    try {
      const parsed = parseDataFile(await file.text(), file.name);
      if (!parsed.rows.length) throw new Error("File data tidak berisi baris.");
      setData({ ...parsed, name: file.name });
      setIterations(parsed.rows.length);
    } catch (e) {
      setData(null);
      setDataError(e instanceof Error ? e.message : String(e));
    }
  };

  const run = () =>
    void startRunner(tabId, {
      requestIds: selected.map((p) => p.request.id),
      iterations,
      delayMs,
      data: data?.rows,
      stopOnError,
      persistVariables,
    });

  const passedItem = (i: RunnerItemResult) => !i.error && i.tests.every((t) => t.passed);
  const shown = items.filter((i) => filter === "all" || (filter === "passed" ? passedItem(i) : !passedItem(i)));
  const testsPassed = items.reduce((n, i) => n + i.tests.filter((t) => t.passed && !t.skipped).length, 0);
  const testsFailed = items.reduce((n, i) => n + i.tests.filter((t) => !t.passed).length, 0);
  const errors = items.filter((i) => i.error).length;
  const total = runner?.total ?? 0;
  const baseName = `${collection.name}${folderName ? `-${folderName}` : ""}`.replace(/[^\w.-]+/g, "_");

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(280px,360px)_1fr]">
      <section aria-label="Konfigurasi runner" className="flex min-h-0 flex-col border-r border-line">
        <div className="border-b border-line px-4 py-3">
          <h1 className="text-base font-semibold">Jalankan {folderName ? `folder "${folderName}"` : `"${collection.name}"`}</h1>
          <p className="text-xs text-muted">Environment: {envName ?? "tanpa environment"}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="flex items-center justify-between px-4 pt-3 pb-1 text-xs text-muted">
            <span>
              {selected.length} dari {plan.length} request
            </span>
            <button type="button" className="text-info hover:underline" onClick={() => setExcluded(excluded.size ? new Set() : new Set(plan.map((p) => p.request.id)))}>
              {excluded.size ? "Pilih semua" : "Kosongkan"}
            </button>
          </div>
          <ul className="px-2 pb-3">
            {plan.map(({ request, ancestors }) => (
              <li key={request.id}>
                <label className="flex h-7 cursor-pointer items-center gap-2 rounded-[4px] px-2 hover:bg-hover">
                  <input
                    type="checkbox"
                    className="accent-[var(--brass)]"
                    checked={!excluded.has(request.id)}
                    onChange={(e) =>
                      setExcluded((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.delete(request.id);
                        else n.add(request.id);
                        return n;
                      })
                    }
                  />
                  <MethodLabel method={request.method} />
                  <span className="min-w-0 flex-1 truncate text-sm">{request.name}</span>
                  {ancestors.length > (folderId ? 1 : 0) && <span className="truncate text-2xs text-faint">{ancestors.at(-1)?.name}</span>}
                </label>
              </li>
            ))}
            {plan.length === 0 && <li className="px-2 text-sm text-muted">Tidak ada request untuk dijalankan.</li>}
          </ul>

          <div className="flex flex-col gap-3 border-t border-line p-4 text-sm">
            <label className="grid grid-cols-[110px_1fr] items-center gap-2">
              <span className="text-muted">Iterasi</span>
              <TextInput type="number" min={1} max={10000} value={iterations} onChange={(e) => setIterations(Math.max(1, Math.min(10000, Number(e.target.value) || 1)))} />
            </label>
            <label className="grid grid-cols-[110px_1fr] items-center gap-2">
              <span className="text-muted">Jeda (ms)</span>
              <TextInput type="number" min={0} step={100} value={delayMs} onChange={(e) => setDelayMs(Math.max(0, Number(e.target.value) || 0))} />
            </label>
            <div className="grid grid-cols-[110px_1fr] items-start gap-2">
              <span className="pt-1.5 text-muted">File data</span>
              <div className="flex min-w-0 flex-col gap-1">
                {data ? (
                  <div className="flex items-center gap-2 rounded-[5px] border border-line px-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">{data.name}</span>
                    <IconButton label="Hapus file data" className="size-6" onClick={() => setData(null)}>
                      <X size={13} />
                    </IconButton>
                  </div>
                ) : (
                  <label className="cursor-pointer rounded-[5px] border border-dashed border-line-strong px-2 py-1.5 text-xs text-muted hover:bg-hover">
                    Pilih CSV atau JSON
                    <input type="file" accept=".csv,.json,text/csv,application/json" className="sr-only" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
                  </label>
                )}
                {data && (
                  <p className="text-2xs text-faint">
                    {data.rows.length} baris · kolom: {data.columns.join(", ")}. Pakai {"{{nama_kolom}}"} di request.
                  </p>
                )}
                {dataError && <p className="text-2xs text-err">{dataError}</p>}
              </div>
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-[var(--brass)]" checked={stopOnError} onChange={(e) => setStopOnError(e.target.checked)} />
              Berhenti saat ada test gagal atau error
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-[var(--brass)]" checked={persistVariables} onChange={(e) => setPersistVariables(e.target.checked)} />
              Simpan perubahan variabel setelah run
            </label>
          </div>
        </div>
        <div className="border-t border-line p-3">
          {running ? (
            <Button variant="danger" className="w-full justify-center" onClick={() => stopRunner(tabId)}>
              <Square size={14} /> Hentikan
            </Button>
          ) : (
            <Button variant="primary" className="w-full justify-center" disabled={!selected.length} onClick={run}>
              <Play size={14} /> Jalankan {selected.length} request{iterations > 1 ? ` × ${iterations}` : ""}
            </Button>
          )}
        </div>
      </section>

      <section aria-label="Hasil runner" className="flex min-h-0 flex-col">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-line px-4 py-3 text-sm">
          {runner ? (
            <>
              <span className="text-muted">
                {items.filter((i) => i.requestId).length}
                {running && total ? ` / ${total}` : ""} request
              </span>
              <span className="text-ok">{testsPassed} lulus</span>
              <span className={testsFailed ? "text-err" : "text-muted"}>{testsFailed} gagal</span>
              <span className={errors ? "text-err" : "text-muted"}>{errors} error</span>
              {summary && <span className="text-muted">rata-rata {summary.totals.avgTimeMs} ms · total {summary.durationMs} ms</span>}
              {summary && summary.stopped !== "completed" && (
                <span className="text-warn">{summary.stopped === "aborted" ? "dihentikan" : summary.stopped === "next-request-null" ? "dihentikan oleh setNextRequest(null)" : "berhenti karena error"}</span>
              )}
              {running && <span className="animate-pulse text-brass">berjalan…</span>}
            </>
          ) : (
            <span className="text-muted">Atur request dan iterasi, lalu tekan Jalankan.</span>
          )}
          {summary && (
            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" className="h-7" onClick={() => download(`${baseName}-run.json`, JSON.stringify(summary, null, 2), "application/json")}>
                <Download size={13} /> JSON
              </Button>
              <Button variant="ghost" className="h-7" onClick={() => download(`${baseName}-junit.xml`, toJUnit(summary, collection.name), "application/xml")}>
                <Download size={13} /> JUnit
              </Button>
            </div>
          )}
        </div>
        {runner?.error && <p className="px-4 py-2 text-sm text-err">{runner.error}</p>}
        {items.length > 0 && (
          <div className="flex gap-1 px-4 pt-2">
            {(["all", "passed", "failed"] as Filter[]).map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)} className={cx("rounded-[4px] px-2 py-1 text-xs", filter === f ? "bg-hover text-text" : "text-muted hover:text-text")}>
                {f === "all" ? "Semua" : f === "passed" ? "Lulus" : "Gagal"}
              </button>
            ))}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
          {shown.map((item, idx) => (
            <ResultRow key={idx} item={item} showIteration={iterations > 1 || (summary?.iterations ?? 1) > 1} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ResultRow({ item, showIteration }: { item: RunnerItemResult; showIteration: boolean }) {
  const failed = !!item.error || item.tests.some((t) => !t.passed);
  const [open, setOpen] = useState(failed);
  return (
    <div className="border-b border-line">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-hover">
        {open ? <ChevronDown size={13} className="text-muted" /> : <ChevronRight size={13} className="text-muted" />}
        {showIteration && <span className="w-8 shrink-0 font-mono text-2xs text-faint">#{item.iteration + 1}</span>}
        <MethodLabel method={item.method || "GET"} />
        <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
        <span className={cx("font-mono text-xs", statusTone(item.status))}>{item.status ?? (item.skipped ? "skip" : "ERR")}</span>
        <span className="w-16 text-right font-mono text-xs text-muted">{item.timeMs !== undefined ? `${item.timeMs} ms` : ""}</span>
        <span className={cx("w-14 text-right text-xs", failed ? "text-err" : "text-ok")}>
          {item.tests.length ? `${item.tests.filter((t) => t.passed).length}/${item.tests.length}` : failed ? "gagal" : "—"}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-1 pb-2 pl-9 text-xs">
          <p className="truncate font-mono text-faint" title={item.url}>
            {item.url}
          </p>
          {item.error && <p className="text-err">{item.error}</p>}
          {item.tests.map((t, i) => (
            <p key={i} className={cx("flex items-start gap-1.5", t.passed ? "text-ok" : "text-err")}>
              {t.passed ? <Check size={12} className="mt-0.5 shrink-0" /> : <X size={12} className="mt-0.5 shrink-0" />}
              <span>
                {t.name}
                {t.error && <span className="block font-mono text-err/90">{t.error}</span>}
              </span>
            </p>
          ))}
          {item.logs.length > 0 && <pre className="mt-1 rounded-[4px] bg-code p-2 font-mono whitespace-pre-wrap text-muted">{item.logs.map((l) => l.args.join(" ")).join("\n")}</pre>}
        </div>
      )}
    </div>
  );
}
