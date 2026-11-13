import type { VariableScopes } from "@packetman/core";
import { shouldInterruptAfterDeadline, type QuickJSWASMModule } from "quickjs-emscripten-core";
import { EPILOGUE, PRELUDE } from "./prelude";

export type ScriptEvent = "prerequest" | "test";

/** The request as seen (and editable) by scripts. Values are unresolved ({{vars}} intact). */
export interface ScriptRequest {
  method: string;
  url: string;
  headers: [string, string][];
  body: { mode: string; raw?: string };
}

export interface ScriptResponse {
  code: number;
  status: string;
  headers: [string, string][];
  body: string;
  responseTime: number;
  responseSize: number;
}

export interface ScriptInfo {
  requestName: string;
  requestId: string;
  iteration: number;
  iterationCount: number;
  location?: string[];
}

export interface ScriptInput {
  event: ScriptEvent;
  code: string;
  variables: VariableScopes;
  environmentName?: string;
  request: ScriptRequest;
  response?: ScriptResponse;
  info: ScriptInfo;
}

export interface TestResult {
  name: string;
  passed: boolean;
  error: string | null;
  skipped: boolean;
}

export interface LogEntry {
  level: "log" | "info" | "warn" | "error";
  args: string[];
}

export interface ScriptResult {
  variables: VariableScopes;
  request: ScriptRequest;
  tests: TestResult[];
  logs: LogEntry[];
  nextRequest?: string | null;
  skipRequest: boolean;
  visualizer: { template: string; data: unknown; options: unknown } | null;
  /** Uncaught error thrown by the script (the script stops at that point). */
  error: string | null;
  durationMs: number;
}

export interface SandboxLimits {
  /** Wall-clock budget for one script, in ms. Default 10 000. */
  timeoutMs?: number;
  /** QuickJS heap limit in bytes. Default 64 MiB. */
  memoryLimitBytes?: number;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/**
 * Run one script in a fresh QuickJS context. Input and output cross the
 * boundary only as JSON, so the script cannot reach host objects, the
 * network, the DOM or storage.
 */
export function runScript(quickjs: QuickJSWASMModule, input: ScriptInput, limits: SandboxLimits = {}): ScriptResult {
  const started = Date.now();
  const passthrough: ScriptResult = {
    variables: clone(input.variables),
    request: clone(input.request),
    tests: [],
    logs: [],
    skipRequest: false,
    visualizer: null,
    error: null,
    durationMs: 0,
  };
  if (!input.code.trim()) return passthrough;

  const runtime = quickjs.newRuntime();
  runtime.setMemoryLimit(limits.memoryLimitBytes ?? 64 * 1024 * 1024);
  runtime.setMaxStackSize(1024 * 1024);
  runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + (limits.timeoutMs ?? 10_000)));
  const vm = runtime.newContext();

  const evalOrThrow = (code: string, filename: string) => {
    const res = vm.evalCode(code, filename);
    if (res.error) {
      const err = vm.dump(res.error) as { name?: string; message?: string } | string;
      res.error.dispose();
      const msg = typeof err === "string" ? err : `${err?.name ?? "Error"}: ${err?.message ?? String(err)}`;
      throw new Error(msg);
    }
    const value = vm.dump(res.value) as unknown;
    res.value.dispose();
    return value;
  };

  try {
    const { code, ...rest } = input;
    evalOrThrow(`var __input = ${JSON.stringify(rest)};`, "input.js");
    evalOrThrow(PRELUDE, "prelude.js");
    // The user script runs in its own function scope; an uncaught error is recorded, not fatal.
    evalOrThrow(
      `try { (function () {\n${code}\n})(); } catch (e) { __out.error = (e && e.name ? e.name + ": " : "") + ((e && e.message) || String(e)); }`,
      `${input.event}.js`,
    );
    // Flush promise jobs (pm.test with async callbacks, setTimeout shim).
    runtime.executePendingJobs(1000);
    const json = evalOrThrow(EPILOGUE, "epilogue.js");
    const out = JSON.parse(String(json)) as Omit<ScriptResult, "durationMs">;
    return { ...out, durationMs: Date.now() - started };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const interrupted = /interrupted/i.test(message);
    return {
      ...passthrough,
      error: interrupted ? `Script dihentikan: melewati batas waktu ${limits.timeoutMs ?? 10_000} ms` : message,
      durationMs: Date.now() - started,
    };
  } finally {
    vm.dispose();
    runtime.dispose();
  }
}
