"use client";

import { countRequests, exportPostmanCollection, exportPostmanEnvironment, type Collection, type TreeNode } from "@packetman/core";
import { ChevronDown, ChevronRight, Copy, Download, FileDown, FolderPlus, Globe, History, Layers, MoreHorizontal, Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GLOBALS_ID, useWorkspace, type SidebarView } from "@/store/workspace";
import { cx, IconButton, MethodLabel, statusTone } from "./ui";

function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name.replace(/[^\w.-]+/g, "_")}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

const VIEWS: { id: SidebarView; label: string; icon: typeof Layers }[] = [
  { id: "collections", label: "Koleksi", icon: Layers },
  { id: "environments", label: "Environment", icon: Globe },
  { id: "history", label: "Riwayat", icon: History },
];

export function Sidebar() {
  const view = useWorkspace((s) => s.sidebarView);
  const setView = useWorkspace((s) => s.setSidebarView);
  return (
    <div className="flex h-full min-h-0">
      <nav aria-label="Navigasi" className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-line bg-panel py-2">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            title={v.label}
            aria-label={v.label}
            aria-current={view === v.id}
            onClick={() => setView(v.id)}
            className={cx("grid size-9 place-items-center rounded-md transition-colors", view === v.id ? "bg-hover text-brass" : "text-muted hover:bg-hover hover:text-text")}
          >
            <v.icon size={18} />
          </button>
        ))}
      </nav>
      <div className="flex min-w-0 flex-1 flex-col bg-panel">
        {view === "collections" && <CollectionsPanel />}
        {view === "environments" && <EnvironmentsPanel />}
        {view === "history" && <HistoryPanel />}
      </div>
    </div>
  );
}

function PanelHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-10 shrink-0 items-center justify-between border-b border-line pr-1.5 pl-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="flex items-center">{children}</div>
    </div>
  );
}

/* ---------------- collections ---------------- */

function CollectionsPanel() {
  const collections = useWorkspace((s) => s.collections);
  const createCollection = useWorkspace((s) => s.createCollection);
  const setImportOpen = useWorkspace((s) => s.setImportOpen);
  const [renaming, setRenaming] = useState<string | null>(null);
  return (
    <>
      <PanelHeader title="Koleksi">
        <IconButton label="Impor" onClick={() => setImportOpen(true)}>
          <FileDown size={15} />
        </IconButton>
        <IconButton
          label="Koleksi baru"
          onClick={() => {
            const id = createCollection("Koleksi baru");
            setRenaming(id);
          }}
        >
          <Plus size={16} />
        </IconButton>
      </PanelHeader>
      <div className="min-h-0 flex-1 overflow-auto py-1" role="tree" aria-label="Koleksi">
        {collections.length === 0 && (
          <div className="flex flex-col gap-2 p-4 text-sm text-muted">
            <p>Belum ada koleksi.</p>
            <button type="button" className="text-left text-info hover:underline" onClick={() => setImportOpen(true)}>
              Impor dari Postman atau cURL
            </button>
          </div>
        )}
        {collections.map((c) => (
          <CollectionItem key={c.id} collection={c} renaming={renaming} setRenaming={setRenaming} />
        ))}
      </div>
    </>
  );
}

function InlineRename({ value, onDone }: { value: string; onDone: (v: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      defaultValue={value}
      aria-label="Nama baru"
      className="h-6 min-w-0 flex-1 rounded-[4px] border border-brass bg-raised px-1.5 text-sm outline-none"
      onBlur={(e) => onDone(e.target.value.trim() || null)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onDone(e.currentTarget.value.trim() || null);
        if (e.key === "Escape") onDone(null);
      }}
    />
  );
}

function RowMenu({ items }: { items: { label: string; icon: typeof Plus; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <IconButton
        label="Aksi lain"
        className="size-6 opacity-0 group-hover:opacity-100 focus:opacity-100 aria-expanded:opacity-100"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <MoreHorizontal size={14} />
      </IconButton>
      {open && (
        <div role="menu" className="absolute top-7 right-0 z-30 w-48 rounded-md border border-line-strong bg-raised py-1 shadow-xl">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                it.onClick();
              }}
              className={cx("flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-hover", it.danger ? "text-err" : "text-text")}
            >
              <it.icon size={14} /> {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CollectionItem({ collection, renaming, setRenaming }: { collection: Collection; renaming: string | null; setRenaming: (id: string | null) => void }) {
  const [open, setOpen] = useState(true);
  const s = useWorkspace.getState(); // actions only; avoids re-rendering on every store change
  return (
    <div role="treeitem" aria-expanded={open} aria-selected={false}>
      <div className="group flex h-8 items-center gap-1 pr-1.5 pl-2 hover:bg-hover">
        <button type="button" aria-label={open ? "Tutup" : "Buka"} onClick={() => setOpen(!open)} className="grid size-5 place-items-center text-muted">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {renaming === collection.id ? (
          <InlineRename
            value={collection.name}
            onDone={(v) => {
              if (v) s.updateCollection(collection.id, (c) => ({ ...c, name: v }));
              setRenaming(null);
            }}
          />
        ) : (
          <button type="button" className="min-w-0 flex-1 truncate text-left text-sm font-medium" onClick={() => setOpen(!open)} onDoubleClick={() => setRenaming(collection.id)}>
            {collection.name}
          </button>
        )}
        <span className="text-2xs text-faint group-hover:hidden">{countRequests(collection.items)}</span>
        <RowMenu
          items={[
            { label: "Request baru", icon: Plus, onClick: () => s.addRequest(collection.id) },
            { label: "Folder baru", icon: FolderPlus, onClick: () => s.addFolder(collection.id) },
            { label: "Variabel, auth & script", icon: Settings2, onClick: () => s.openCollectionTab(collection.id) },
            { label: "Ganti nama", icon: Pencil, onClick: () => setRenaming(collection.id) },
            { label: "Ekspor (Postman v2.1)", icon: Download, onClick: () => downloadJson(collection.name, exportPostmanCollection(collection)) },
            {
              label: "Hapus koleksi",
              icon: Trash2,
              danger: true,
              onClick: () => {
                if (window.confirm(`Hapus koleksi "${collection.name}"? Tindakan ini tidak bisa dibatalkan.`)) s.deleteCollection(collection.id);
              },
            },
          ]}
        />
      </div>
      {open && (
        <div role="group">
          {collection.items.map((n) => (
            <TreeRow key={n.id} node={n} depth={1} collectionId={collection.id} renaming={renaming} setRenaming={setRenaming} />
          ))}
          {collection.items.length === 0 && (
            <button type="button" onClick={() => s.addRequest(collection.id)} className="block py-1 pl-9 text-xs text-info hover:underline">
              Tambah request pertama
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TreeRow({ node, depth, collectionId, renaming, setRenaming }: { node: TreeNode; depth: number; collectionId: string; renaming: string | null; setRenaming: (id: string | null) => void }) {
  const [open, setOpen] = useState(true);
  const s = useWorkspace.getState(); // actions only; avoids re-rendering on every store change
  const activeRequestId = useWorkspace((st) => {
    const t = st.tabs.find((x) => x.id === st.activeTabId);
    return t?.kind === "request" ? t.requestId : null;
  });
  const pad = { paddingLeft: 8 + depth * 14 };

  const rename = renaming === node.id && (
    <InlineRename
      value={node.name}
      onDone={(v) => {
        if (v) s.renameNode(collectionId, node.id, v);
        setRenaming(null);
      }}
    />
  );
  const confirmDelete = () => {
    if (window.confirm(`Hapus "${node.name}"?`)) s.deleteNode(collectionId, node.id);
  };

  if (node.type === "folder") {
    return (
      <div role="treeitem" aria-expanded={open} aria-selected={false}>
        <div className="group flex h-7 items-center gap-1 pr-1.5 hover:bg-hover" style={pad}>
          <button type="button" aria-label={open ? "Tutup folder" : "Buka folder"} onClick={() => setOpen(!open)} className="grid size-5 place-items-center text-muted">
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          {rename || (
            <button type="button" className="min-w-0 flex-1 truncate text-left text-sm text-text" onClick={() => setOpen(!open)} onDoubleClick={() => setRenaming(node.id)}>
              {node.name}
            </button>
          )}
          <RowMenu
            items={[
              { label: "Request baru", icon: Plus, onClick: () => s.addRequest(collectionId, node.id) },
              { label: "Folder baru", icon: FolderPlus, onClick: () => s.addFolder(collectionId, node.id) },
              { label: "Ganti nama", icon: Pencil, onClick: () => setRenaming(node.id) },
              { label: "Hapus folder", icon: Trash2, danger: true, onClick: confirmDelete },
            ]}
          />
        </div>
        {open && (
          <div role="group">
            {node.items.map((n) => (
              <TreeRow key={n.id} node={n} depth={depth + 1} collectionId={collectionId} renaming={renaming} setRenaming={setRenaming} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      role="treeitem"
      aria-selected={activeRequestId === node.id}
      className={cx("group flex h-7 cursor-pointer items-center gap-1.5 pr-1.5 hover:bg-hover", activeRequestId === node.id && "bg-hover")}
      style={{ paddingLeft: 8 + depth * 14 + 20 }}
      onClick={() => s.openRequest(collectionId, node.id)}
      onDoubleClick={() => setRenaming(node.id)}
    >
      <MethodLabel method={node.method} />
      {rename || <span className="min-w-0 flex-1 truncate text-sm">{node.name}</span>}
      <RowMenu
        items={[
          { label: "Ganti nama", icon: Pencil, onClick: () => setRenaming(node.id) },
          { label: "Duplikat", icon: Copy, onClick: () => s.duplicateRequest(collectionId, node.id) },
          { label: "Hapus request", icon: Trash2, danger: true, onClick: confirmDelete },
        ]}
      />
    </div>
  );
}

/* ---------------- environments ---------------- */

function EnvironmentsPanel() {
  const environments = useWorkspace((s) => s.environments);
  const activeEnvId = useWorkspace((s) => s.activeEnvId);
  const s = useWorkspace.getState(); // actions only; avoids re-rendering on every store change
  return (
    <>
      <PanelHeader title="Environment">
        <IconButton
          label="Environment baru"
          onClick={() => {
            const id = s.createEnvironment("Environment baru");
            s.openEnvironmentTab(id);
          }}
        >
          <Plus size={16} />
        </IconButton>
      </PanelHeader>
      <div className="min-h-0 flex-1 overflow-auto py-1">
        <button type="button" onClick={() => s.openEnvironmentTab(GLOBALS_ID)} className="flex h-8 w-full items-center gap-2 px-3 text-left text-sm hover:bg-hover">
          <Globe size={14} className="text-muted" /> Globals
        </button>
        <div className="mx-3 my-1 border-t border-line" />
        {environments.length === 0 && <p className="px-3 py-2 text-sm text-muted">Belum ada environment.</p>}
        {environments.map((e) => (
          <div key={e.id} className="group flex h-8 items-center gap-2 pr-1.5 pl-3 hover:bg-hover">
            <input
              type="radio"
              name="active-env"
              aria-label={`Aktifkan ${e.name}`}
              checked={activeEnvId === e.id}
              onChange={() => s.setActiveEnv(e.id)}
              className="accent-[var(--brass)]"
            />
            <button type="button" className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => s.openEnvironmentTab(e.id)}>
              {e.name}
            </button>
            <span className="text-2xs text-faint group-hover:hidden">{e.values.length}</span>
            <RowMenu
              items={[
                { label: "Ekspor (Postman)", icon: Download, onClick: () => downloadJson(e.name, exportPostmanEnvironment(e)) },
                {
                  label: "Hapus",
                  icon: Trash2,
                  danger: true,
                  onClick: () => window.confirm(`Hapus environment "${e.name}"?`) && s.deleteEnvironment(e.id),
                },
              ]}
            />
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------------- history ---------------- */

function HistoryPanel() {
  const history = useWorkspace((s) => s.history);
  const openHistory = useWorkspace((s) => s.openHistory);
  const clearHistory = useWorkspace((s) => s.clearHistory);
  const groups = new Map<string, typeof history>();
  for (const h of history) {
    const day = new Date(h.at).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });
    groups.set(day, [...(groups.get(day) ?? []), h]);
  }
  return (
    <>
      <PanelHeader title="Riwayat">
        <IconButton label="Hapus semua riwayat" disabled={!history.length} onClick={() => window.confirm("Hapus semua riwayat di browser ini?") && clearHistory()}>
          <Trash2 size={15} />
        </IconButton>
      </PanelHeader>
      <div className="min-h-0 flex-1 overflow-auto py-1">
        {history.length === 0 && <p className="px-3 py-2 text-sm text-muted">Request yang kamu kirim akan muncul di sini. Riwayat hanya tersimpan di browser ini.</p>}
        {[...groups.entries()].map(([day, items]) => (
          <div key={day}>
            <p className="px-3 pt-2 pb-1 text-2xs text-faint">{day}</p>
            {items.map((h) => (
              <button key={h.id} type="button" onClick={() => openHistory(h)} className="flex h-7 w-full items-center gap-1.5 px-3 text-left hover:bg-hover" title={h.url}>
                <MethodLabel method={h.method} />
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted">{h.url.replace(/^https?:\/\//, "")}</span>
                <span className={cx("font-mono text-2xs", statusTone(h.status))}>{h.status ?? "ERR"}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
