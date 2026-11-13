import {
  flattenRequests,
  findNode,
  type Collection,
  type DataRow,
  type FolderNode,
  type RequestData,
  type RequestNode,
  type ResolvedRequest,
  type ResponseData,
  type VariableScopes,
} from "@packetman/core";
import type { QuickJSWASMModule } from "quickjs-emscripten-core";
import { executeRequest } from "./pipeline";
import type { LogEntry, TestResult } from "./sandbox";

export interface RunnerItemResult {
  iteration: number;
  requestId: string;
  name: string;
  method: string;
  url: string;
  status?: number;
  statusText?: string;
  timeMs?: number;
  size?: number;
  executor?: string;
  tests: TestResult[];
  logs: LogEntry[];
  error?: string;
  skipped?: boolean;
}

export interface RunnerTotals {
  requests: number;
  testsPassed: number;
  testsFailed: number;
  errors: number;
  avgTimeMs: number;
}

export interface RunnerSummary {
  items: RunnerItemResult[];
  totals: RunnerTotals;
  iterations: number;
  durationMs: number;
  /** Scopes after the run (environment/collection/global changes made by scripts). */
  scopes: VariableScopes;
  stopped: "completed" | "aborted" | "error" | "next-request-null";
}

export type RunnerEvent = { type: "start"; total: number } | { type: "item"; item: RunnerItemResult; index: number } | { type: "iteration"; iteration: number };

export interface RunnerOptions {
  quickjs: QuickJSWASMModule;
  collection: Collection;
  /** Run only this folder (and its sub-folders). */
  folderId?: string;
  /** Explicit request order/selection (ids). Defaults to every request in tree order. */
  requestIds?: string[];
  iterations: number;
  delayMs?: number;
  data?: DataRow[];
  stopOnError?: boolean;
  scopes: VariableScopes;
  environmentName?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Safety valve for setNextRequest loops: max executions per iteration. */
  maxStepsPerIteration?: number;
  send: (req: ResolvedRequest, request: RequestData) => Promise<ResponseData>;
  onEvent?: (e: RunnerEvent) => void;
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (!ms || signal?.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

/** The ordered list of requests a run will execute, with their folder ancestry. */
export function runnerPlan(collection: Collection, folderId?: string, requestIds?: string[]): { request: RequestNode; ancestors: FolderNode[] }[] {
  let items = collection.items;
  let base: FolderNode[] = [];
  if (folderId) {
    const loc = findNode(collection, folderId);
    if (!loc || loc.node.type !== "folder") throw new Error("Folder tidak ditemukan.");
    items = loc.node.items;
    base = [...loc.ancestors, loc.node];
  }
  const all = flattenRequests(items, base);
  if (!requestIds) return all;
  const byId = new Map(all.map((x) => [x.request.id, x]));
  return requestIds.map((id) => byId.get(id)).filter((x): x is { request: RequestNode; ancestors: FolderNode[] } => !!x);
}

/**
 * Collection Runner: executes requests in order for N iterations, feeding one
 * data row per iteration into the "data" scope. Environment, collection and
 * global changes carry over between requests and iterations, like Postman.
 * Supports pm.execution.setNextRequest(name | null).
 */
export async function runCollection(opts: RunnerOptions): Promise<RunnerSummary> {
  const started = Date.now();
  const plan = runnerPlan(opts.collection, opts.folderId, opts.requestIds);
  const iterations = Math.max(1, Math.floor(opts.iterations || 1));
  const maxSteps = opts.maxStepsPerIteration ?? Math.max(100, plan.length * 10);
  let scopes: VariableScopes = JSON.parse(JSON.stringify(opts.scopes));
  const items: RunnerItemResult[] = [];
  let stopped: RunnerSummary["stopped"] = "completed";

  opts.onEvent?.({ type: "start", total: plan.length * iterations });

  outer: for (let it = 0; it < iterations; it++) {
    opts.onEvent?.({ type: "iteration", iteration: it });
    const row = opts.data?.length ? opts.data[it % opts.data.length]! : {};
    scopes = { ...scopes, data: { ...row } };
    let idx = 0;
    let steps = 0;
    while (idx < plan.length) {
      if (opts.signal?.aborted) {
        stopped = "aborted";
        break outer;
      }
      if (++steps > maxSteps) {
        items.push({ iteration: it, requestId: "", name: "(runner)", method: "", url: "", tests: [], logs: [], error: `Dihentikan: lebih dari ${maxSteps} langkah dalam satu iterasi (cek loop setNextRequest).` });
        stopped = "error";
        break outer;
      }
      const { request, ancestors } = plan[idx]!;
      const res = await executeRequest({
        quickjs: opts.quickjs,
        request,
        ancestors,
        collection: opts.collection,
        scopes,
        environmentName: opts.environmentName,
        iteration: it,
        iterationCount: iterations,
        timeoutMs: opts.timeoutMs,
        send: opts.send,
      });
      scopes = { ...res.scopes, local: {} };
      const item: RunnerItemResult = {
        iteration: it,
        requestId: request.id,
        name: request.name,
        method: res.resolved?.method ?? request.method,
        url: res.resolved?.url ?? request.url,
        status: res.response?.status,
        statusText: res.response?.statusText,
        timeMs: res.response?.timings.total,
        size: res.response?.size,
        executor: res.response?.executor,
        tests: res.tests,
        logs: res.logs,
        error: res.error ?? (res.aborted ? res.logs.at(-1)?.args.join(" ") : undefined),
        skipped: res.skipped,
      };
      items.push(item);
      opts.onEvent?.({ type: "item", item, index: items.length - 1 });

      if (opts.stopOnError && (item.error || item.tests.some((t) => !t.passed))) {
        stopped = "error";
        break outer;
      }

      if (res.nextRequest === null) {
        stopped = "next-request-null";
        break;
      }
      if (typeof res.nextRequest === "string") {
        const target = plan.findIndex((p) => p.request.name === res.nextRequest);
        idx = target >= 0 ? target : idx + 1;
      } else {
        idx++;
      }
      if (idx < plan.length || it < iterations - 1) await sleep(opts.delayMs ?? 0, opts.signal);
    }
  }

  const timed = items.filter((i) => i.timeMs !== undefined);
  return {
    items,
    iterations,
    durationMs: Date.now() - started,
    scopes: { ...scopes, local: {}, data: {} },
    stopped,
    totals: {
      requests: items.filter((i) => i.requestId).length,
      testsPassed: items.reduce((n, i) => n + i.tests.filter((t) => t.passed && !t.skipped).length, 0),
      testsFailed: items.reduce((n, i) => n + i.tests.filter((t) => !t.passed).length, 0),
      errors: items.filter((i) => i.error).length,
      avgTimeMs: timed.length ? Math.round(timed.reduce((n, i) => n + (i.timeMs ?? 0), 0) / timed.length) : 0,
    },
  };
}

function xmlEscape(s: string) {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
}

/** JUnit XML report (for CI dashboards). One testsuite per request execution. */
export function toJUnit(summary: RunnerSummary, name: string): string {
  const suites = summary.items
    .filter((i) => i.requestId)
    .map((i) => {
      const cases = i.tests.length ? i.tests : [{ name: "request", passed: !i.error, error: i.error ?? null, skipped: false }];
      const failures = cases.filter((t) => !t.passed).length;
      const body = cases
        .map(
          (t) =>
            `    <testcase name="${xmlEscape(t.name)}" classname="${xmlEscape(i.name)}" time="${((i.timeMs ?? 0) / 1000).toFixed(3)}">` +
            (t.skipped ? "<skipped/>" : t.passed ? "" : `<failure message="${xmlEscape(t.error ?? "failed")}"/>`) +
            "</testcase>",
        )
        .join("\n");
      return `  <testsuite name="${xmlEscape(`${i.name} (iterasi ${i.iteration + 1})`)}" tests="${cases.length}" failures="${failures}" time="${((i.timeMs ?? 0) / 1000).toFixed(3)}">\n${body}\n  </testsuite>`;
    })
    .join("\n");
  const total = summary.totals.testsPassed + summary.totals.testsFailed;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="${xmlEscape(name)}" tests="${total}" failures="${summary.totals.testsFailed}" time="${(summary.durationMs / 1000).toFixed(3)}">\n${suites}\n</testsuites>\n`;
}
