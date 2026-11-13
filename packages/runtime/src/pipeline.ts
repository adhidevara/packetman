import {
  buildRequest,
  paramsFromUrl,
  type Collection,
  type FolderNode,
  type RequestData,
  type ResolvedRequest,
  type ResponseData,
  type Scripts,
  type VariableScopes,
} from "@packetman/core";
import type { QuickJSWASMModule } from "quickjs-emscripten-core";
import { runScript, type LogEntry, type ScriptRequest, type ScriptResponse, type TestResult } from "./sandbox";

export interface ScriptRun {
  event: "prerequest" | "test";
  level: "collection" | "folder" | "request";
  name: string;
  error: string | null;
  durationMs: number;
}

export interface ExecutionResult {
  /** Request as actually sent (after scripts, variables and auth). */
  resolved?: ResolvedRequest;
  response?: ResponseData;
  /** Network / executor error, if the request could not be sent. */
  error?: string;
  /** Set when a pre-request script failed and the request was not sent. */
  aborted?: boolean;
  skipped?: boolean;
  tests: TestResult[];
  logs: LogEntry[];
  scripts: ScriptRun[];
  /** Variable scopes after all scripts ran (persist environment/collection/global). */
  scopes: VariableScopes;
  nextRequest?: string | null;
  visualizer: { template: string; data: unknown } | null;
}

export interface ExecuteOptions {
  quickjs: QuickJSWASMModule;
  request: RequestData & { id: string };
  ancestors: FolderNode[];
  collection?: Collection;
  scopes: VariableScopes;
  environmentName?: string;
  iteration?: number;
  iterationCount?: number;
  timeoutMs?: number;
  send: (req: ResolvedRequest, request: RequestData) => Promise<ResponseData>;
}

function toScriptRequest(r: RequestData): ScriptRequest {
  return {
    method: r.method,
    url: r.url,
    headers: r.headers.filter((h) => h.enabled && h.key).map((h) => [h.key, h.value]),
    body: r.body.mode === "raw" ? { mode: "raw", raw: r.body.raw } : { mode: r.body.mode },
  };
}

/** Apply edits a pre-request script made to pm.request back onto the editable request. */
function applyScriptRequest(base: RequestData, sr: ScriptRequest): RequestData {
  const disabled = base.headers.filter((h) => !h.enabled);
  const headers = sr.headers.map(([key, value], i) => {
    const prev = base.headers.filter((h) => h.enabled && h.key)[i];
    return { id: prev?.id ?? `h-${i}-${key}`, key, value, enabled: true };
  });
  const next: RequestData = { ...base, method: sr.method, url: sr.url, headers: [...headers, ...disabled] };
  if (base.body.mode === "raw" && typeof sr.body.raw === "string") next.body = { ...base.body, raw: sr.body.raw };
  if (sr.url !== base.url) next.params = paramsFromUrl(sr.url, base.params);
  return next;
}

function chain(collection: Collection | undefined, ancestors: FolderNode[], request: RequestData): { level: ScriptRun["level"]; name: string; scripts: Scripts }[] {
  const out: { level: ScriptRun["level"]; name: string; scripts: Scripts }[] = [];
  if (collection) out.push({ level: "collection", name: collection.name, scripts: collection.scripts });
  for (const f of ancestors) out.push({ level: "folder", name: f.name, scripts: f.scripts });
  out.push({ level: "request", name: request.name, scripts: request.scripts });
  return out;
}

/**
 * Full request lifecycle:
 * pre-request scripts (collection → folders → request) → resolve variables & auth →
 * send via executor → post-response scripts (same order) → tests, logs, updated scopes.
 */
export async function executeRequest(opts: ExecuteOptions): Promise<ExecutionResult> {
  const { quickjs, collection, ancestors, environmentName } = opts;
  let scopes: VariableScopes = { ...JSON.parse(JSON.stringify(opts.scopes)), local: {} };
  let request: RequestData = JSON.parse(JSON.stringify(opts.request));
  const result: ExecutionResult = { tests: [], logs: [], scripts: [], scopes, visualizer: null };
  const info = {
    requestName: request.name,
    requestId: opts.request.id,
    iteration: opts.iteration ?? 0,
    iterationCount: opts.iterationCount ?? 1,
    location: [...(collection ? [collection.name] : []), ...ancestors.map((a) => a.name), request.name],
  };
  const links = chain(collection, ancestors, request);

  for (const link of links) {
    if (!link.scripts.preRequest.trim()) continue;
    const out = runScript(
      quickjs,
      { event: "prerequest", code: link.scripts.preRequest, variables: scopes, environmentName, request: toScriptRequest(request), info },
      { timeoutMs: opts.timeoutMs },
    );
    scopes = out.variables;
    request = applyScriptRequest(request, out.request);
    result.tests.push(...out.tests);
    result.logs.push(...out.logs);
    result.scripts.push({ event: "prerequest", level: link.level, name: link.name, error: out.error, durationMs: out.durationMs });
    if (out.nextRequest !== undefined) result.nextRequest = out.nextRequest;
    if (out.error) {
      result.logs.push({ level: "error", args: [`Pre-request script (${link.level}: ${link.name}) gagal: ${out.error}`] });
      result.aborted = true;
      result.scopes = scopes;
      return result;
    }
    if (out.skipRequest) {
      result.skipped = true;
      result.scopes = scopes;
      return result;
    }
  }

  const resolved = buildRequest(request, { scopes, ancestors, collection });
  result.resolved = resolved;

  let response: ResponseData;
  try {
    response = await opts.send(resolved, request);
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
    result.scopes = scopes;
    return result;
  }
  result.response = response;

  const scriptResponse: ScriptResponse = {
    code: response.status,
    status: response.statusText,
    headers: response.headers,
    body: response.body,
    responseTime: response.timings.total,
    responseSize: response.size,
  };

  for (const link of links) {
    if (!link.scripts.postResponse.trim()) continue;
    const out = runScript(
      quickjs,
      { event: "test", code: link.scripts.postResponse, variables: scopes, environmentName, request: toScriptRequest(request), response: scriptResponse, info },
      { timeoutMs: opts.timeoutMs },
    );
    scopes = out.variables;
    result.tests.push(...out.tests);
    result.logs.push(...out.logs);
    result.scripts.push({ event: "test", level: link.level, name: link.name, error: out.error, durationMs: out.durationMs });
    if (out.nextRequest !== undefined) result.nextRequest = out.nextRequest;
    if (out.visualizer) result.visualizer = out.visualizer;
    if (out.error) result.logs.push({ level: "error", args: [`Post-response script (${link.level}: ${link.name}) gagal: ${out.error}`] });
  }

  result.scopes = scopes;
  return result;
}
