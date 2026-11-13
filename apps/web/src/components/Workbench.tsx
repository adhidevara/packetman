"use client";

import { Bot, FileDown, Globe, Layers, Moon, Play, Plus, Sun, Terminal, X } from "lucide-react";
import { useEffect } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { BACKGROUND_CATEGORIES } from "@/lib/egress";
import type { ExecutorMode } from "@/lib/executors";
import { GLOBALS_ID, useWorkspace, type Tab } from "@/store/workspace";
import { ConsolePanel, EgressMonitor, useEgress } from "./BottomPanels";
import { CodePanel } from "./CodePanel";
import { ImportDialog, RelayConsentDialog, SaveDialog } from "./Dialogs";
import { RequestPane } from "./RequestPane";
import { ResponsePane } from "./ResponsePane";
import { RunnerTab } from "./RunnerTab";
import { CollectionTab, EnvironmentTab } from "./SettingsTabs";
import { Sidebar } from "./Sidebar";
import { Button, cx, EmptyState, IconButton, MethodLabel, Select } from "./ui";

export function Workbench() {
  const ready = useWorkspace((s) => s.ready);
  const init = useWorkspace((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const s = useWorkspace.getState();
      const tab = s.tabs.find((t) => t.id === s.activeTabId);
      if (e.key === "Enter" && tab?.kind === "request") {
        e.preventDefault();
        void s.send(tab.id);
      } else if (e.key.toLowerCase() === "s" && tab?.kind === "request") {
        e.preventDefault();
        s.saveTab(tab.id);
      } else if (e.key.toLowerCase() === "t" && e.altKey) {
        e.preventDefault();
        s.newScratchTab();
      } else if (e.key.toLowerCase() === "o" && !e.shiftKey) {
        e.preventDefault();
        s.setImportOpen(true);
      } else if (e.key === "`") {
        e.preventDefault();
        s.setBottomPanel(s.bottomPanel === "console" ? null : "console");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-sm text-muted">
        <span className="seal" aria-hidden /> Membuka workspace lokal…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="min-h-0 flex-1">
        <Group orientation="horizontal" className="h-full">
          <Panel defaultSize="22" minSize="200px" maxSize="40">
            <Sidebar />
          </Panel>
          <Separator className="w-px bg-line transition-colors hover:bg-brass data-[separator=active]:bg-brass" />
          <Panel minSize="40">
            <MainArea />
          </Panel>
        </Group>
      </div>
      <StatusBar />
      <ImportDialog />
      <RelayConsentDialog />
      <SaveDialog />
    </div>
  );
}

function TopBar() {
  const environments = useWorkspace((s) => s.environments);
  const activeEnvId = useWorkspace((s) => s.activeEnvId);
  const theme = useWorkspace((s) => s.theme);
  const { setActiveEnv, setImportOpen, setTheme, openEnvironmentTab, newScratchTab } = useWorkspace.getState();
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
      <div className="flex items-center gap-2 pr-2">
        <span className="seal" aria-hidden />
        <span className="text-[15px] font-bold tracking-tight">packetman</span>
      </div>
      <Button variant="ghost" onClick={() => newScratchTab()} title="Request baru (Ctrl+Alt+T)">
        <Plus size={15} /> Baru
      </Button>
      <Button variant="ghost" onClick={() => setImportOpen(true)} title="Impor (Ctrl+O)">
        <FileDown size={15} /> Impor
      </Button>
      <div className="ml-auto flex items-center gap-2">
        <label htmlFor="env-select" className="text-xs text-muted">
          Environment
        </label>
        <Select id="env-select" value={activeEnvId ?? ""} onChange={(e) => setActiveEnv(e.target.value || null)} className="w-48">
          <option value="">Tanpa environment</option>
          {environments.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </Select>
        <Button variant="ghost" className="px-2" disabled={!activeEnvId} onClick={() => activeEnvId && openEnvironmentTab(activeEnvId)} title="Lihat variabel environment aktif">
          Variabel
        </Button>
        <Button variant="ghost" className="px-2" onClick={() => openEnvironmentTab(GLOBALS_ID)}>
          Globals
        </Button>
        <IconButton label={theme === "dark" ? "Tema terang" : "Tema gelap"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </IconButton>
      </div>
    </header>
  );
}

function tabLabel(tab: Tab, envName: (id: string) => string, colName: (id: string) => string) {
  if (tab.kind === "request") return tab.draft.name || "Untitled";
  if (tab.kind === "environment") return tab.envId === GLOBALS_ID ? "Globals" : envName(tab.envId);
  if (tab.kind === "runner") return `Runner · ${colName(tab.collectionId)}`;
  return colName(tab.collectionId);
}

function TabBar() {
  const tabs = useWorkspace((s) => s.tabs);
  const activeTabId = useWorkspace((s) => s.activeTabId);
  const environments = useWorkspace((s) => s.environments);
  const collections = useWorkspace((s) => s.collections);
  const { setActiveTab, closeTab, newScratchTab } = useWorkspace.getState();
  const envName = (id: string) => environments.find((e) => e.id === id)?.name ?? "Environment";
  const colName = (id: string) => collections.find((c) => c.id === id)?.name ?? "Koleksi";
  return (
    <div role="tablist" aria-label="Tab terbuka" className="flex h-10 shrink-0 items-stretch overflow-x-auto border-b border-line bg-panel">
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tab"
          aria-selected={t.id === activeTabId}
          tabIndex={0}
          onClick={() => setActiveTab(t.id)}
          onKeyDown={(e) => e.key === "Enter" && setActiveTab(t.id)}
          onAuxClick={(e) => e.button === 1 && closeTab(t.id)}
          className={cx(
            "group relative flex max-w-56 min-w-32 cursor-pointer items-center gap-1.5 border-r border-line pr-1 pl-3 text-sm",
            t.id === activeTabId ? "bg-bg text-text" : "text-muted hover:bg-hover",
          )}
        >
          {t.id === activeTabId && <span className="absolute inset-x-0 top-0 h-0.5 bg-brass" />}
          {t.kind === "request" ? (
            <MethodLabel method={t.draft.method} className="w-auto" />
          ) : t.kind === "environment" ? (
            <Globe size={13} className="shrink-0 text-faint" />
          ) : t.kind === "runner" ? (
            <Play size={13} className="shrink-0 text-faint" />
          ) : (
            <Layers size={13} className="shrink-0 text-faint" />
          )}
          <span className="min-w-0 flex-1 truncate">{tabLabel(t, envName, colName)}</span>
          {t.kind === "request" && t.dirty && <span className="size-1.5 shrink-0 rounded-full bg-brass group-hover:hidden" title="Belum disimpan" />}
          <IconButton
            label="Tutup tab"
            className={cx("size-6", t.kind === "request" && t.dirty ? "hidden group-hover:inline-grid" : "opacity-0 group-hover:opacity-100 focus:opacity-100")}
            onClick={(e) => {
              e.stopPropagation();
              if (t.kind === "request" && t.dirty && !window.confirm("Tutup tab tanpa menyimpan perubahan?")) return;
              closeTab(t.id);
            }}
          >
            <X size={13} />
          </IconButton>
        </div>
      ))}
      <IconButton label="Tab baru" className="m-1.5" onClick={() => newScratchTab()}>
        <Plus size={15} />
      </IconButton>
    </div>
  );
}

function MainArea() {
  const tab = useWorkspace((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const codeOpen = useWorkspace((s) => s.codePanelOpen);
  const bottom = useWorkspace((s) => s.bottomPanel);
  const { newScratchTab, setImportOpen } = useWorkspace.getState();

  let content: React.ReactNode;
  if (!tab) {
    content = (
      <EmptyState title="Tidak ada tab terbuka">
        <div className="mt-2 flex justify-center gap-2">
          <Button variant="primary" onClick={() => newScratchTab()}>
            Request baru
          </Button>
          <Button onClick={() => setImportOpen(true)}>Impor koleksi</Button>
        </div>
      </EmptyState>
    );
  } else if (tab.kind === "environment") {
    content = <EnvironmentTab envId={tab.envId} />;
  } else if (tab.kind === "collection") {
    content = <CollectionTab collectionId={tab.collectionId} />;
  } else if (tab.kind === "runner") {
    content = <RunnerTab key={tab.id} tabId={tab.id} collectionId={tab.collectionId} folderId={tab.folderId} />;
  } else {
    content = (
      <Group orientation="horizontal" className="h-full">
        <Panel minSize="40">
          <Group orientation="vertical" className="h-full">
            <Panel defaultSize="48" minSize="120px">
              <RequestPane key={tab.id} tab={tab} />
            </Panel>
            <Separator className="h-px bg-line transition-colors hover:bg-brass data-[separator=active]:bg-brass" />
            <Panel minSize="80px">
              <ResponsePane key={tab.id} tab={tab} />
            </Panel>
          </Group>
        </Panel>
        {codeOpen && (
          <>
            <Separator className="w-px bg-line hover:bg-brass" />
            <Panel defaultSize="32" minSize="260px">
              <CodePanel tab={tab} />
            </Panel>
          </>
        )}
      </Group>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <TabBar />
      <div className="min-h-0 flex-1">{content}</div>
      {bottom && <div className="h-60 shrink-0 border-t border-line bg-panel">{bottom === "console" ? <ConsolePanel /> : <EgressMonitor />}</div>}
    </div>
  );
}

const MODE_LABEL: Record<ExecutorMode, string> = {
  auto: "Otomatis (lokal dulu)",
  direct: "Browser langsung",
  extension: "Extension",
  relay: "Relay (dengan izin)",
};

function StatusBar() {
  const mode = useWorkspace((s) => s.executorMode);
  const extensionVersion = useWorkspace((s) => s.extensionVersion);
  const bottom = useWorkspace((s) => s.bottomPanel);
  const { setExecutorMode, setBottomPanel } = useWorkspace.getState();
  const egress = useEgress();
  const background = egress.filter((e) => BACKGROUND_CATEGORIES.includes(e.category)).length;
  const relayed = egress.filter((e) => e.category === "relay").length;

  return (
    <footer className="flex h-8 shrink-0 items-center gap-4 border-t border-line bg-panel px-3 text-xs text-muted">
      <label className="flex items-center gap-1.5">
        <span>Kirim via</span>
        <select
          aria-label="Jalur pengiriman"
          value={mode}
          onChange={(e) => setExecutorMode(e.target.value as ExecutorMode)}
          className="rounded-[4px] bg-transparent py-0.5 text-text outline-none hover:bg-hover"
        >
          {(Object.keys(MODE_LABEL) as ExecutorMode[]).map((m) => (
            <option key={m} value={m} className="bg-panel">
              {MODE_LABEL[m]}
            </option>
          ))}
        </select>
      </label>
      <span className="flex items-center gap-1.5" title={extensionVersion ? `Packetman Interceptor ${extensionVersion}` : "Extension tidak terdeteksi"}>
        <span className={cx("size-1.5 rounded-full", extensionVersion ? "bg-ok" : "bg-faint")} />
        Extension {extensionVersion ? "aktif" : "tidak ada"}
      </span>
      <button
        type="button"
        onClick={() => setBottomPanel(bottom === "egress" ? null : "egress")}
        className={cx("flex items-center gap-1.5 rounded-[4px] px-1.5 py-0.5 hover:bg-hover hover:text-text", bottom === "egress" && "bg-hover text-text")}
        title="Buka Egress Monitor"
      >
        <span className={cx("seal scale-75", background > 0 && "seal-broken")} aria-hidden />
        {background === 0 ? "Tersegel · 0 koneksi latar" : `${background} koneksi latar`}
        {relayed > 0 && <span className="text-warn">· {relayed} lewat relay</span>}
      </button>
      <span className="flex items-center gap-1.5" title="Packetbot (AI) mati secara default">
        <Bot size={13} /> AI mati
      </span>
      <button
        type="button"
        onClick={() => setBottomPanel(bottom === "console" ? null : "console")}
        className={cx("ml-auto flex items-center gap-1.5 rounded-[4px] px-1.5 py-0.5 hover:bg-hover hover:text-text", bottom === "console" && "bg-hover text-text")}
        title="Console (Ctrl+`)"
      >
        <Terminal size={13} /> Console
      </button>
    </footer>
  );
}
