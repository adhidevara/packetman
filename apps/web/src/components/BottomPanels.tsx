"use client";

import { Ban, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { BACKGROUND_CATEGORIES, subscribeEgress, type EgressEntry } from "@/lib/egress";
import { useWorkspace } from "@/store/workspace";
import { cx, formatBytes, IconButton } from "./ui";

export function useEgress(): EgressEntry[] {
  const [entries, setEntries] = useState<EgressEntry[]>([]);
  useEffect(() => subscribeEgress(setEntries), []);
  return entries;
}

const CATEGORY_LABEL: Record<EgressEntry["category"], string> = {
  relay: "Relay",
  sync: "Sync",
  ai: "AI",
  update: "Cek update",
  telemetry: "Telemetri",
};

export function EgressMonitor() {
  const entries = useEgress();
  const relayHosts = useWorkspace((s) => s.relayAllowedHosts);
  const { revokeRelayHost, setBottomPanel } = useWorkspace.getState();
  const background = entries.filter((e) => BACKGROUND_CATEGORIES.includes(e.category));
  return (
    <section aria-label="Egress Monitor" className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-line pr-1.5 pl-3">
        <span className={cx("seal", background.length > 0 && "seal-broken")} aria-hidden />
        <h2 className="text-sm font-semibold">Egress Monitor</h2>
        <p className="truncate text-xs text-muted">
          {background.length === 0 ? "Packetman tidak membuat koneksi latar belakang di sesi ini." : `${background.length} koneksi latar belakang di sesi ini.`}
        </p>
        <IconButton label="Tutup" className="ml-auto" onClick={() => setBottomPanel(null)}>
          <X size={15} />
        </IconButton>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_280px]">
        <div className="min-h-0 overflow-auto">
          {entries.length === 0 ? (
            <div className="p-4 text-sm text-muted">
              <p>Belum ada koneksi dari Packetman sendiri.</p>
              <p className="mt-1 text-xs text-faint">
                Request yang kamu kirim langsung dari browser atau lewat extension tidak tercatat di sini karena tidak melewati server Packetman. Lihat Riwayat dan Console untuk itu.
              </p>
            </div>
          ) : (
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 bg-panel text-left text-2xs text-muted">
                <tr className="border-b border-line">
                  <th className="px-3 py-1.5 font-normal">Waktu</th>
                  <th className="px-3 py-1.5 font-normal">Jenis</th>
                  <th className="px-3 py-1.5 font-normal">Tujuan</th>
                  <th className="px-3 py-1.5 font-normal">Untuk</th>
                  <th className="px-3 py-1.5 font-normal">Isi</th>
                  <th className="px-3 py-1.5 text-right font-normal">Keluar / masuk</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-line align-top">
                    <td className="px-3 py-1.5 font-mono text-muted">{new Date(e.at).toLocaleTimeString("id-ID")}</td>
                    <td className="px-3 py-1.5">{CATEGORY_LABEL[e.category]}</td>
                    <td className="px-3 py-1.5 font-mono">{e.host}</td>
                    <td className="px-3 py-1.5">{e.purpose}</td>
                    <td className="px-3 py-1.5 text-muted">{e.content}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-muted">
                      {formatBytes(e.bytesOut)} / {formatBytes(e.bytesIn)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <aside className="min-h-0 overflow-auto border-l border-line p-3 text-xs">
          <p className="mb-1.5 font-medium">Kebijakan</p>
          <ul className="flex flex-col gap-1 text-muted">
            <li>Telemetri: diblokir</li>
            <li>Sync cloud: belum ada (data hanya di browser ini)</li>
            <li>AI: mati</li>
            <li>Relay: hanya dengan izinmu</li>
          </ul>
          <p className="mt-3 mb-1.5 font-medium">Domain yang boleh lewat relay</p>
          {relayHosts.length === 0 ? (
            <p className="text-muted">Belum ada. Packetman akan bertanya dulu sebelum memakai relay.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {relayHosts.map((h) => (
                <li key={h} className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono">{h}</span>
                  <IconButton label={`Cabut izin relay untuk ${h}`} className="size-6" onClick={() => revokeRelayHost(h)}>
                    <Ban size={12} />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </section>
  );
}

export function ConsolePanel() {
  const entries = useWorkspace((s) => s.consoleEntries);
  const { clearConsole, setBottomPanel } = useWorkspace.getState();
  return (
    <section aria-label="Console" className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line pr-1.5 pl-3">
        <h2 className="text-sm font-semibold">Console</h2>
        <span className="text-xs text-muted">{entries.length} baris</span>
        <div className="ml-auto flex items-center">
          <IconButton label="Bersihkan console" onClick={clearConsole}>
            <Trash2 size={14} />
          </IconButton>
          <IconButton label="Tutup" onClick={() => setBottomPanel(null)}>
            <X size={15} />
          </IconButton>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto font-mono text-xs">
        {entries.length === 0 && <p className="p-3 font-sans text-sm text-muted">Setiap request dan console.log dari script muncul di sini.</p>}
        {entries.map((e) => (
          <div
            key={e.id}
            className={cx(
              "flex gap-3 border-b border-line px-3 py-1 whitespace-pre-wrap",
              e.level === "error" && "text-err",
              e.level === "warn" && "text-warn",
              e.level === "request" && "text-text",
              (e.level === "log" || e.level === "info") && "text-muted",
            )}
          >
            <span className="shrink-0 text-faint">{new Date(e.at).toLocaleTimeString("id-ID")}</span>
            <span className="min-w-0 break-all">{e.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
