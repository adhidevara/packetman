"use client";

import {
  buildAuthorizeUrl,
  buildTokenRequest,
  findNode,
  generatePkce,
  parseTokenResponse,
  randomString,
  resolveString,
  type OAuth2Auth,
  type TokenGrant,
  findRequest,
  importCurl,
  importPostmanCollection,
  importPostmanEnvironment,
  insertNode,
  isPostmanCollection,
  isPostmanEnvironment,
  looksLikeCurl,
  markVariablesSecret,
  newCollection,
  newEnvironment,
  newFolder,
  newId,
  newRequest,
  removeNode,
  scanCollection,
  scanEnvironment,
  updateNode,
  variablesToMap,
  type Collection,
  type DataRow,
  type Environment,
  type RequestData,
  type RequestNode,
  type RequestSettings,
  type ResolvedRequest,
  type ResponseData,
  type SecretFinding,
  type ScopeValues,
  type TreeNode,
  type Variable,
  type VariableScopes,
} from "@packetman/core";
import { executeRequest, runCollection, type ExecutionResult, type RunnerItemResult, type RunnerSummary } from "@packetman/runtime";
import { create } from "zustand";
import { db, getSetting, setSetting, type HistoryEntry } from "@/lib/db";
import { CorsOrNetworkError, detectExtension, safeHost, sendDirect, sendViaExtension, sendViaRelay, type ExecutorMode } from "@/lib/executors";
import { OAUTH_POPUP_FEATURES, oauthRedirectUri, waitForAuthorizationCode } from "@/lib/oauthPopup";
import { loadQuickJS } from "@/lib/quickjs";
import { demoCollection, demoEnvironment } from "@/lib/seed";

/* ---------------- types ---------------- */

export type Tab =
  | { id: string; kind: "request"; collectionId: string | null; requestId: string | null; draft: RequestNode; dirty: boolean }
  | { id: string; kind: "environment"; envId: string }
  | { id: string; kind: "collection"; collectionId: string }
  | { id: string; kind: "runner"; collectionId: string; folderId?: string };

export interface RunnerConfig {
  requestIds: string[];
  iterations: number;
  delayMs: number;
  data?: DataRow[];
  stopOnError: boolean;
  /** Save environment/collection/global changes made by scripts after the run. */
  persistVariables: boolean;
}

export interface RunnerState {
  running: boolean;
  total: number;
  items: RunnerItemResult[];
  summary?: RunnerSummary;
  controller?: AbortController;
  error?: string;
}

export interface RunState {
  loading: boolean;
  startedAt?: number;
  result?: ExecutionResult;
}

export interface ConsoleEntry {
  id: string;
  at: number;
  level: "request" | "log" | "info" | "warn" | "error";
  text: string;
}

export type RelayDecision = "once" | "always" | "deny";

export interface ImportSummary {
  kind: "collection" | "environment" | "curl";
  name: string;
  warnings: string[];
  secrets: SecretFinding[];
  /** Id of the imported collection/environment so findings can be fixed. */
  targetId: string;
}

export type SidebarView = "collections" | "environments" | "history";

const GLOBALS_ID = "globals";

let initStarted = false;

interface State {
  ready: boolean;
  collections: Collection[];
  environments: Environment[];
  globals: Environment;
  history: HistoryEntry[];
  tabs: Tab[];
  activeTabId: string | null;
  activeEnvId: string | null;
  runs: Record<string, RunState>;
  runners: Record<string, RunnerState>;
  consoleEntries: ConsoleEntry[];
  executorMode: ExecutorMode;
  extensionVersion: string | null;
  relayAllowedHosts: string[];
  relayPrompt: { host: string; resolve: (d: RelayDecision) => void } | null;
  theme: "dark" | "light";
  sidebarView: SidebarView;
  bottomPanel: "console" | "egress" | null;
  codePanelOpen: boolean;
  importOpen: boolean;
  saveDialogTabId: string | null;
  /** Authorize URL to open manually when the browser blocked the OAuth popup. */
  oauthPendingUrl: string | null;
}

interface Actions {
  init(): Promise<void>;
  setTheme(theme: State["theme"]): void;
  setSidebarView(v: SidebarView): void;
  setBottomPanel(p: State["bottomPanel"]): void;
  toggleCodePanel(): void;
  setImportOpen(open: boolean): void;
  setExecutorMode(mode: ExecutorMode): void;
  revokeRelayHost(host: string): void;
  resolveRelayPrompt(decision: RelayDecision): void;

  openRequest(collectionId: string, requestId: string): void;
  newScratchTab(partial?: Partial<RequestData>): void;
  openEnvironmentTab(envId: string): void;
  openCollectionTab(collectionId: string): void;
  closeTab(id: string): void;
  setActiveTab(id: string): void;
  updateDraft(tabId: string, patch: Partial<RequestData>): void;
  saveTab(tabId: string, target?: { collectionId: string; name: string }): void;
  setSaveDialog(tabId: string | null): void;

  createCollection(name?: string): string;
  updateCollection(id: string, fn: (c: Collection) => Collection): void;
  deleteCollection(id: string): void;
  addRequest(collectionId: string, parentId?: string): void;
  addFolder(collectionId: string, parentId?: string): void;
  renameNode(collectionId: string, nodeId: string, name: string): void;
  deleteNode(collectionId: string, nodeId: string): void;
  duplicateRequest(collectionId: string, nodeId: string): void;

  createEnvironment(name?: string): string;
  updateEnvironment(env: Environment): void;
  deleteEnvironment(id: string): void;
  setActiveEnv(id: string | null): void;

  send(tabId: string): Promise<void>;
  /** Obtain (or refresh) an OAuth 2.0 token. Must be called from a click handler (opens a popup). */
  fetchOAuthToken(auth: OAuth2Auth, collectionId: string | null, mode: "new" | "refresh"): Promise<OAuth2Auth>;
  openRunnerTab(collectionId: string, folderId?: string): void;
  startRunner(tabId: string, config: RunnerConfig): Promise<void>;
  stopRunner(tabId: string): void;
  clearConsole(): void;
  clearHistory(): void;
  openHistory(entry: HistoryEntry): void;

  importText(text: string): ImportSummary;
  markSecrets(summary: ImportSummary, variableIds: string[]): void;
}

export type Store = State & Actions;

/* ---------------- persistence helpers ---------------- */

const persist = {
  collection: (c: Collection) => void db().collections.put(c).catch(() => {}),
  removeCollection: (id: string) => void db().collections.delete(id).catch(() => {}),
  environment: (e: Environment) => void db().environments.put(e).catch(() => {}),
  removeEnvironment: (id: string) => void db().environments.delete(id).catch(() => {}),
};

function persistTabs(state: State) {
  const open = state.tabs
    .filter((t): t is Extract<Tab, { kind: "request" }> => t.kind === "request" && !!t.collectionId && !!t.requestId)
    .map((t) => ({ collectionId: t.collectionId, requestId: t.requestId }));
  void setSetting("openTabs", open);
}

/** Write script-made variable changes back as current values (local only, never synced). */
function applyScopeChanges(vars: Variable[], before: ScopeValues, after: ScopeValues): Variable[] {
  let out = vars.map((v) => ({ ...v }));
  for (const [key, value] of Object.entries(after)) {
    if (before[key] === value) continue;
    const existing = out.find((v) => v.key === key && v.enabled);
    if (existing) existing.currentValue = value;
    else out.push({ id: newId(), key, value: "", currentValue: value, type: "default", enabled: true });
  }
  for (const key of Object.keys(before)) {
    if (!(key in after)) out = out.filter((v) => v.key !== key);
  }
  return out;
}

function draftFrom(node: RequestNode): RequestNode {
  return JSON.parse(JSON.stringify(node)) as RequestNode;
}

/* ---------------- store ---------------- */

export const useWorkspace = create<Store>()((set, get) => {
  const pushConsole = (entries: Omit<ConsoleEntry, "id" | "at">[]) =>
    set((s) => ({
      consoleEntries: [...s.consoleEntries, ...entries.map((e) => ({ ...e, id: newId(), at: Date.now() }))].slice(-1000),
    }));

  const askRelay = (host: string) =>
    new Promise<RelayDecision>((resolve) => {
      set({ relayPrompt: { host, resolve } });
    });

  async function dispatch(resolved: ResolvedRequest, settings: RequestSettings): Promise<ResponseData> {
    const { executorMode } = get();
    const host = safeHost(resolved.url);

    const relayWithConsent = async () => {
      if (!get().relayAllowedHosts.includes(host)) {
        const decision = await askRelay(host);
        if (decision === "deny") throw new Error("Request dibatalkan: relay tidak diizinkan untuk domain ini.");
        if (decision === "always") {
          const hosts = [...get().relayAllowedHosts, host];
          set({ relayAllowedHosts: hosts });
          void setSetting("relayAllowedHosts", hosts);
        }
      }
      return sendViaRelay(resolved, settings);
    };

    if (executorMode === "relay") return relayWithConsent();
    if (executorMode === "extension") return sendViaExtension(resolved, settings);
    if (executorMode === "direct") return sendDirect(resolved, settings);

    if (get().extensionVersion) return sendViaExtension(resolved, settings);
    try {
      return await sendDirect(resolved, settings);
    } catch (e) {
      if (!(e instanceof CorsOrNetworkError)) throw e;
      if (/^(localhost|127\.|0\.0\.0\.0|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host.endsWith(".local")) {
        throw new Error(`${e.message} Target lokal (${host}) butuh Packetman Interceptor extension; relay cloud tidak boleh mengakses alamat lokal.`);
      }
      return relayWithConsent();
    }
  }

  /** Scopes visible to requests in a collection, from the current store state. */
  function scopesFor(collection?: Collection): { scopes: VariableScopes; env?: Environment } {
    const state = get();
    const env = state.environments.find((e) => e.id === state.activeEnvId);
    return {
      env,
      scopes: {
        local: {},
        data: {},
        environment: variablesToMap(env?.values),
        collection: variablesToMap(collection?.variables),
        global: variablesToMap(state.globals.values),
      },
    };
  }

  /** Persist script-made variable changes (current values, local only). */
  function persistScopes(before: VariableScopes, after: VariableScopes, env: Environment | undefined, collection: Collection | undefined) {
    const changed = (a: ScopeValues, b: ScopeValues) => JSON.stringify(a) !== JSON.stringify(b);
    if (env && changed(before.environment, after.environment)) {
      const fresh = get().environments.find((e) => e.id === env.id) ?? env;
      get().updateEnvironment({ ...fresh, values: applyScopeChanges(fresh.values, before.environment, after.environment) });
    }
    if (collection && changed(before.collection, after.collection)) {
      get().updateCollection(collection.id, (c) => ({ ...c, variables: applyScopeChanges(c.variables, before.collection, after.collection) }));
    }
    if (changed(before.global, after.global)) {
      const g = get().globals;
      get().updateEnvironment({ ...g, values: applyScopeChanges(g.values, before.global, after.global) });
    }
  }

  const setRunner = (tabId: string, patch: Partial<RunnerState> | ((r: RunnerState) => Partial<RunnerState>)) =>
    set((s) => {
      const cur = s.runners[tabId] ?? { running: false, total: 0, items: [] };
      return { runners: { ...s.runners, [tabId]: { ...cur, ...(typeof patch === "function" ? patch(cur) : patch) } } };
    });

  return {
    ready: false,
    collections: [],
    environments: [],
    globals: { ...newEnvironment("Globals"), id: GLOBALS_ID },
    history: [],
    tabs: [],
    activeTabId: null,
    activeEnvId: null,
    runs: {},
    runners: {},
    consoleEntries: [],
    executorMode: "auto",
    extensionVersion: null,
    relayAllowedHosts: [],
    relayPrompt: null,
    theme: "dark",
    sidebarView: "collections",
    bottomPanel: null,
    codePanelOpen: false,
    importOpen: false,
    saveDialogTabId: null,
    oauthPendingUrl: null,

    async init() {
      // React StrictMode runs effects twice in dev; only the first call loads/seeds data.
      if (initStarted) return;
      initStarted = true;
      let collections: Collection[] = [];
      let environments: Environment[] = [];
      let history: HistoryEntry[] = [];
      try {
        [collections, environments, history] = await Promise.all([
          db().collections.orderBy("updatedAt").toArray(),
          db().environments.toArray(),
          db().history.orderBy("at").reverse().limit(300).toArray(),
        ]);
      } catch {
        /* IndexedDB unavailable: run in memory */
      }
      let globals = environments.find((e) => e.id === GLOBALS_ID);
      environments = environments.filter((e) => e.id !== GLOBALS_ID);
      const seeded = await getSetting("seeded", false);
      if (!seeded && collections.length === 0) {
        const c = demoCollection();
        const e = demoEnvironment();
        collections = [c];
        environments = [e];
        persist.collection(c);
        persist.environment(e);
        void setSetting("seeded", true);
        void setSetting("activeEnvId", e.id);
      }
      globals ??= { ...newEnvironment("Globals"), id: GLOBALS_ID };
      const [activeEnvId, executorMode, relayAllowedHosts, theme, openTabs] = await Promise.all([
        getSetting<string | null>("activeEnvId", environments[0]?.id ?? null),
        getSetting<ExecutorMode>("executorMode", "auto"),
        getSetting<string[]>("relayAllowedHosts", []),
        getSetting<"dark" | "light">("theme", "dark"),
        getSetting<{ collectionId: string; requestId: string }[]>("openTabs", []),
      ]);

      const tabs: Tab[] = [];
      for (const t of openTabs) {
        const col = collections.find((c) => c.id === t.collectionId);
        const hit = col && findRequest(col, t.requestId);
        if (hit) tabs.push({ id: newId(), kind: "request", collectionId: col.id, requestId: hit.request.id, draft: draftFrom(hit.request), dirty: false });
      }
      if (!tabs.length) {
        const first = collections[0];
        const firstReq = first && (function find(items: TreeNode[]): RequestNode | undefined {
          for (const n of items) {
            if (n.type === "request") return n;
            const r = find(n.items);
            if (r) return r;
          }
          return undefined;
        })(first.items);
        if (first && firstReq) tabs.push({ id: newId(), kind: "request", collectionId: first.id, requestId: firstReq.id, draft: draftFrom(firstReq), dirty: false });
      }

      set({
        ready: true,
        collections,
        environments,
        globals,
        history,
        tabs,
        activeTabId: tabs[0]?.id ?? null,
        activeEnvId: environments.some((e) => e.id === activeEnvId) ? activeEnvId : null,
        executorMode,
        relayAllowedHosts,
        theme,
      });
      document.documentElement.dataset.theme = theme;
      const version = await detectExtension();
      set({ extensionVersion: version });
    },

    setTheme(theme) {
      set({ theme });
      document.documentElement.dataset.theme = theme;
      void setSetting("theme", theme);
    },
    setSidebarView: (sidebarView) => set({ sidebarView }),
    setBottomPanel: (bottomPanel) => set({ bottomPanel }),
    toggleCodePanel: () => set((s) => ({ codePanelOpen: !s.codePanelOpen })),
    setImportOpen: (importOpen) => set({ importOpen }),
    setExecutorMode(mode) {
      set({ executorMode: mode });
      void setSetting("executorMode", mode);
    },
    revokeRelayHost(host) {
      const hosts = get().relayAllowedHosts.filter((h) => h !== host);
      set({ relayAllowedHosts: hosts });
      void setSetting("relayAllowedHosts", hosts);
    },
    resolveRelayPrompt(decision) {
      const p = get().relayPrompt;
      set({ relayPrompt: null });
      p?.resolve(decision);
    },

    /* ---------- tabs ---------- */

    openRequest(collectionId, requestId) {
      const existing = get().tabs.find((t) => t.kind === "request" && t.requestId === requestId);
      if (existing) return set({ activeTabId: existing.id });
      const col = get().collections.find((c) => c.id === collectionId);
      const hit = col && findRequest(col, requestId);
      if (!hit) return;
      const tab: Tab = { id: newId(), kind: "request", collectionId, requestId, draft: draftFrom(hit.request), dirty: false };
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
      persistTabs(get());
    },
    newScratchTab(partial) {
      const draft = newRequest({ name: "Untitled request", ...partial });
      const tab: Tab = { id: newId(), kind: "request", collectionId: null, requestId: null, draft, dirty: !!partial };
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
    },
    openEnvironmentTab(envId) {
      const existing = get().tabs.find((t) => t.kind === "environment" && t.envId === envId);
      if (existing) return set({ activeTabId: existing.id });
      const tab: Tab = { id: newId(), kind: "environment", envId };
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
    },
    openCollectionTab(collectionId) {
      const existing = get().tabs.find((t) => t.kind === "collection" && t.collectionId === collectionId);
      if (existing) return set({ activeTabId: existing.id });
      const tab: Tab = { id: newId(), kind: "collection", collectionId };
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
    },
    closeTab(id) {
      get().runners[id]?.controller?.abort();
      set((s) => {
        const idx = s.tabs.findIndex((t) => t.id === id);
        const tabs = s.tabs.filter((t) => t.id !== id);
        const runs = { ...s.runs };
        delete runs[id];
        const runners = { ...s.runners };
        delete runners[id];
        const activeTabId = s.activeTabId === id ? (tabs[Math.min(idx, tabs.length - 1)]?.id ?? null) : s.activeTabId;
        return { tabs, runs, runners, activeTabId };
      });
      persistTabs(get());
    },
    setActiveTab: (id) => set({ activeTabId: id }),
    updateDraft(tabId, patch) {
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === tabId && t.kind === "request" ? { ...t, draft: { ...t.draft, ...patch }, dirty: true } : t)),
      }));
    },
    saveTab(tabId, target) {
      const tab = get().tabs.find((t) => t.id === tabId);
      if (!tab || tab.kind !== "request") return;
      if (!tab.collectionId || !tab.requestId) {
        if (!target) return set({ saveDialogTabId: tabId });
        const node: RequestNode = { ...draftFrom(tab.draft), id: newId(), name: target.name || tab.draft.name };
        get().updateCollection(target.collectionId, (c) => insertNode(c, node));
        set((s) => ({
          saveDialogTabId: null,
          tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, collectionId: target.collectionId, requestId: node.id, draft: draftFrom(node), dirty: false } : t)),
        }));
        persistTabs(get());
        return;
      }
      const draft = draftFrom(tab.draft);
      get().updateCollection(tab.collectionId, (c) => updateNode(c, tab.requestId!, () => draft));
      set((s) => ({ tabs: s.tabs.map((t) => (t.id === tabId && t.kind === "request" ? { ...t, dirty: false } : t)) }));
    },
    setSaveDialog: (saveDialogTabId) => set({ saveDialogTabId }),

    /* ---------- collections ---------- */

    createCollection(name = "New Collection") {
      const c = newCollection(name);
      set((s) => ({ collections: [...s.collections, c] }));
      persist.collection(c);
      return c.id;
    },
    updateCollection(id, fn) {
      let updated: Collection | undefined;
      set((s) => ({
        collections: s.collections.map((c) => {
          if (c.id !== id) return c;
          updated = { ...fn(c), updatedAt: Date.now() };
          return updated;
        }),
      }));
      if (updated) persist.collection(updated);
    },
    deleteCollection(id) {
      set((s) => ({
        collections: s.collections.filter((c) => c.id !== id),
        tabs: s.tabs.filter((t) => !((t.kind === "request" || t.kind === "collection") && t.collectionId === id)),
      }));
      persist.removeCollection(id);
      persistTabs(get());
    },
    addRequest(collectionId, parentId) {
      const node = newRequest({ name: "New request" });
      get().updateCollection(collectionId, (c) => insertNode(c, node, parentId));
      get().openRequest(collectionId, node.id);
    },
    addFolder(collectionId, parentId) {
      get().updateCollection(collectionId, (c) => insertNode(c, newFolder("New folder"), parentId));
    },
    renameNode(collectionId, nodeId, name) {
      get().updateCollection(collectionId, (c) => updateNode(c, nodeId, (n) => ({ ...n, name })));
      set((s) => ({
        tabs: s.tabs.map((t) => (t.kind === "request" && t.requestId === nodeId ? { ...t, draft: { ...t.draft, name } } : t)),
      }));
    },
    deleteNode(collectionId, nodeId) {
      const col = get().collections.find((c) => c.id === collectionId);
      const loc = col && findNode(col, nodeId);
      const removedIds = new Set<string>();
      const collect = (n: TreeNode) => {
        removedIds.add(n.id);
        if (n.type === "folder") n.items.forEach(collect);
      };
      if (loc) collect(loc.node);
      get().updateCollection(collectionId, (c) => removeNode(c, nodeId));
      set((s) => ({ tabs: s.tabs.filter((t) => !(t.kind === "request" && t.requestId && removedIds.has(t.requestId))) }));
      persistTabs(get());
    },
    duplicateRequest(collectionId, nodeId) {
      const col = get().collections.find((c) => c.id === collectionId);
      const loc = col && findNode(col, nodeId);
      if (!loc || loc.node.type !== "request") return;
      const copy: RequestNode = { ...draftFrom(loc.node), id: newId(), name: `${loc.node.name} (copy)` };
      const parent = loc.ancestors.at(-1);
      get().updateCollection(collectionId, (c) => insertNode(c, copy, parent?.id));
    },

    /* ---------- environments ---------- */

    createEnvironment(name = "New Environment") {
      const e = newEnvironment(name);
      set((s) => ({ environments: [...s.environments, e] }));
      persist.environment(e);
      return e.id;
    },
    updateEnvironment(env) {
      const updated = { ...env, updatedAt: Date.now() };
      if (env.id === GLOBALS_ID) set({ globals: updated });
      else set((s) => ({ environments: s.environments.map((e) => (e.id === env.id ? updated : e)) }));
      persist.environment(updated);
    },
    deleteEnvironment(id) {
      set((s) => ({
        environments: s.environments.filter((e) => e.id !== id),
        activeEnvId: s.activeEnvId === id ? null : s.activeEnvId,
        tabs: s.tabs.filter((t) => !(t.kind === "environment" && t.envId === id)),
      }));
      persist.removeEnvironment(id);
    },
    setActiveEnv(id) {
      set({ activeEnvId: id });
      void setSetting("activeEnvId", id);
    },

    /* ---------- execution ---------- */

    async send(tabId) {
      const state = get();
      const tab = state.tabs.find((t) => t.id === tabId);
      if (!tab || tab.kind !== "request") return;
      const collection = tab.collectionId ? state.collections.find((c) => c.id === tab.collectionId) : undefined;
      const ancestors = collection && tab.requestId ? (findNode(collection, tab.requestId)?.ancestors ?? []) : [];
      const { scopes, env } = scopesFor(collection);

      set((s) => ({ runs: { ...s.runs, [tabId]: { loading: true, startedAt: Date.now() } } }));

      let result: ExecutionResult;
      try {
        const quickjs = await loadQuickJS();
        result = await executeRequest({
          quickjs,
          request: { ...tab.draft, id: tab.requestId ?? tab.draft.id },
          ancestors,
          collection,
          scopes,
          environmentName: env?.name,
          timeoutMs: 10_000,
          send: (resolved, req) => dispatch(resolved, req.settings),
        });
      } catch (e) {
        result = { tests: [], logs: [], scripts: [], scopes, visualizer: null, error: e instanceof Error ? e.message : String(e) };
      }

      persistScopes(scopes, result.scopes, env, collection);
      set((s) => ({ runs: { ...s.runs, [tabId]: { loading: false, result } } }));

      const res = result.response;
      const line = result.resolved
        ? `${result.resolved.method} ${result.resolved.url} → ${res ? `${res.status} ${res.statusText} · ${res.timings.total} ms · via ${res.executor}` : (result.error ?? "gagal")}`
        : `${tab.draft.method} ${tab.draft.url} → ${result.aborted ? "dibatalkan oleh pre-request script" : (result.error ?? "tidak dikirim")}`;
      pushConsole([
        { level: res ? "request" : "error", text: line },
        ...result.logs.map((l) => ({ level: l.level as ConsoleEntry["level"], text: l.args.join(" ") })),
      ]);

      const entry: HistoryEntry = {
        id: newId(),
        at: Date.now(),
        name: tab.draft.name,
        method: result.resolved?.method ?? tab.draft.method,
        url: result.resolved?.url ?? tab.draft.url,
        status: res?.status,
        timeMs: res?.timings.total,
        executor: res?.executor,
        error: result.error,
        request: draftFrom(tab.draft),
      };
      set((s) => ({ history: [entry, ...s.history].slice(0, 300) }));
      void db().history.put(entry).catch(() => {});
    },
    async fetchOAuthToken(auth, collectionId, mode) {
      // Open the popup synchronously, before any await, so popup blockers allow it.
      const needsPopup = mode === "new" && auth.grantType === "authorization_code";
      const popup = needsPopup ? window.open("about:blank", "packetman-oauth", OAUTH_POPUP_FEATURES) : null;
      try {
        const collection = collectionId ? get().collections.find((c) => c.id === collectionId) : undefined;
        const { scopes } = scopesFor(collection);
        const r = (s: string) => resolveString(s, scopes);
        let grant: TokenGrant;
        if (mode === "refresh") {
          if (!auth.refreshToken) throw new Error("Tidak ada refresh token.");
          grant = { grant: "refresh_token", refreshToken: auth.refreshToken };
        } else if (auth.grantType === "client_credentials") {
          grant = { grant: "client_credentials" };
        } else {
          const redirectUri = oauthRedirectUri();
          const state = randomString(32);
          const pkce = auth.usePkce ? await generatePkce() : undefined;
          const url = buildAuthorizeUrl(auth, { state, redirectUri, codeChallenge: pkce?.challenge }, r);
          // Popup blocked: show the login link so the user can open it in a tab; the callback reports back over BroadcastChannel.
          if (!popup) set({ oauthPendingUrl: url });
          const code = await waitForAuthorizationCode(popup, url, state).finally(() => set({ oauthPendingUrl: null }));
          grant = { grant: "authorization_code", code, redirectUri, codeVerifier: pkce?.verifier };
        }
        const tokenReq = buildTokenRequest(auth, grant, r);
        const res = await dispatch(tokenReq, { followRedirects: true, timeoutMs: 30_000 });
        const token = parseTokenResponse(res.status, res.body);
        pushConsole([{ level: "info", text: `OAuth 2.0: token ${mode === "refresh" ? "diperbarui" : "diperoleh"} dari ${safeHost(tokenReq.url)} via ${res.executor}. Token disimpan hanya di browser ini.` }]);
        return {
          ...auth,
          accessToken: token.accessToken,
          tokenType: token.tokenType,
          refreshToken: token.refreshToken ?? (mode === "refresh" ? auth.refreshToken : undefined),
          expiresAt: token.expiresAt,
        };
      } catch (e) {
        if (popup && !popup.closed) popup.close();
        pushConsole([{ level: "error", text: `OAuth 2.0 gagal: ${e instanceof Error ? e.message : String(e)}` }]);
        throw e;
      }
    },
    openRunnerTab(collectionId, folderId) {
      const existing = get().tabs.find((t) => t.kind === "runner" && t.collectionId === collectionId && t.folderId === folderId);
      if (existing) return set({ activeTabId: existing.id });
      const tab: Tab = { id: newId(), kind: "runner", collectionId, folderId };
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
    },
    async startRunner(tabId, config) {
      const tab = get().tabs.find((t) => t.id === tabId);
      if (!tab || tab.kind !== "runner" || get().runners[tabId]?.running) return;
      const collection = get().collections.find((c) => c.id === tab.collectionId);
      if (!collection) return;
      const { scopes, env } = scopesFor(collection);
      const controller = new AbortController();
      setRunner(tabId, { running: true, total: config.requestIds.length * config.iterations, items: [], summary: undefined, controller, error: undefined });
      try {
        const quickjs = await loadQuickJS();
        const summary = await runCollection({
          quickjs,
          collection,
          folderId: tab.folderId,
          requestIds: config.requestIds,
          iterations: config.iterations,
          delayMs: config.delayMs,
          data: config.data,
          stopOnError: config.stopOnError,
          scopes,
          environmentName: env?.name,
          timeoutMs: 10_000,
          signal: controller.signal,
          send: (resolved, req) => dispatch(resolved, req.settings),
          onEvent: (e) => {
            if (e.type === "item") setRunner(tabId, (r) => ({ items: [...r.items, e.item] }));
          },
        });
        if (config.persistVariables) persistScopes(scopes, summary.scopes, env, collection);
        setRunner(tabId, { running: false, summary, controller: undefined });
        const t = summary.totals;
        pushConsole([
          {
            level: t.testsFailed || t.errors ? "warn" : "request",
            text: `Runner "${collection.name}": ${t.requests} request, ${t.testsPassed} test lulus, ${t.testsFailed} gagal, ${t.errors} error, ${summary.durationMs} ms`,
          },
        ]);
      } catch (e) {
        setRunner(tabId, { running: false, controller: undefined, error: e instanceof Error ? e.message : String(e) });
      }
    },
    stopRunner(tabId) {
      get().runners[tabId]?.controller?.abort();
    },
    clearConsole: () => set({ consoleEntries: [] }),
    clearHistory() {
      set({ history: [] });
      void db().history.clear().catch(() => {});
    },
    openHistory(entry) {
      const req = entry.request as RequestNode;
      get().newScratchTab({ ...req, name: req.name ?? entry.name });
    },

    /* ---------- import ---------- */

    importText(text) {
      const trimmed = text.trim();
      if (looksLikeCurl(trimmed)) {
        const req = importCurl(trimmed);
        get().newScratchTab(req);
        set({ importOpen: false });
        return { kind: "curl", name: req.name, warnings: [], secrets: [], targetId: "" };
      }
      let data: unknown;
      try {
        data = JSON.parse(trimmed);
      } catch {
        throw new Error("Format tidak dikenali. Tempel JSON Postman (collection/environment) atau perintah cURL.");
      }
      if (isPostmanCollection(data)) {
        const { value, warnings } = importPostmanCollection(data);
        set((s) => ({ collections: [...s.collections, value], sidebarView: "collections" }));
        persist.collection(value);
        return { kind: "collection", name: value.name, warnings, secrets: scanCollection(value), targetId: value.id };
      }
      if (isPostmanEnvironment(data)) {
        const { value, warnings } = importPostmanEnvironment(data);
        set((s) => ({ environments: [...s.environments, value] }));
        persist.environment(value);
        return { kind: "environment", name: value.name, warnings, secrets: scanEnvironment(value), targetId: value.id };
      }
      throw new Error("JSON valid, tapi bukan Postman Collection v2.x atau Environment.");
    },
    markSecrets(summary, variableIds) {
      const ids = new Set(variableIds);
      if (summary.kind === "collection") get().updateCollection(summary.targetId, (c) => markVariablesSecret(c, ids));
      if (summary.kind === "environment") {
        const env = get().environments.find((e) => e.id === summary.targetId);
        if (env) get().updateEnvironment(markVariablesSecret(env, ids));
      }
    },
  };
});

export { GLOBALS_ID };
