"use client";

import { byteLength, type ExecutorKind, type RequestSettings, type ResolvedRequest, type ResponseData } from "@packetman/core";
import { egressFetch, recordEgressBytesIn } from "./egress";

/**
 * Layered executors (spec §5.2). Local paths first:
 *   extension (bypasses CORS, runs in the user's browser) → direct fetch.
 * The cloud relay is used only with explicit, per-domain consent.
 */

export class CorsOrNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CorsOrNetworkError";
  }
}

// Headers browsers refuse to let pages set (fetch spec "forbidden request-headers").
const FORBIDDEN = new Set([
  "accept-charset", "accept-encoding", "access-control-request-headers", "access-control-request-method", "connection",
  "content-length", "cookie", "cookie2", "date", "dnt", "expect", "host", "keep-alive", "origin", "referer", "te",
  "trailer", "transfer-encoding", "upgrade", "via", "user-agent",
]);

function isForbidden(name: string) {
  const n = name.toLowerCase();
  return FORBIDDEN.has(n) || n.startsWith("proxy-") || n.startsWith("sec-");
}

function encodeBody(req: ResolvedRequest): BodyInit | undefined {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  switch (req.body.kind) {
    case "none":
      return undefined;
    case "text":
      return req.body.text;
    case "urlencoded":
      return new URLSearchParams(req.body.fields).toString();
    case "formdata": {
      const fd = new FormData();
      for (const [k, v] of req.body.fields) fd.append(k, v);
      return fd;
    }
  }
}

/* ---------------- Direct (browser fetch) ---------------- */

export async function sendDirect(req: ResolvedRequest, settings: RequestSettings): Promise<ResponseData> {
  const notes: string[] = [];
  const headers = new Headers();
  for (const [k, v] of req.headers) {
    if (isForbidden(k)) {
      notes.push(`Browser memblokir header "${k}" pada mode Direct. Pakai Extension atau Relay untuk mengirimnya.`);
      continue;
    }
    if (req.body.kind === "formdata" && k.toLowerCase() === "content-type") continue;
    try {
      headers.append(k, v);
    } catch {
      notes.push(`Header "${k}" tidak valid dan dilewati.`);
    }
  }
  const started = performance.now();
  let res: Response;
  try {
    // eslint-disable-next-line no-restricted-globals -- user-initiated request to the user's own target
    res = await fetch(req.url, {
      method: req.method,
      headers,
      body: encodeBody(req),
      redirect: settings.followRedirects ? "follow" : "manual",
      credentials: "omit",
      mode: "cors",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(settings.timeoutMs),
    });
  } catch (e) {
    if ((e as Error).name === "TimeoutError") throw new Error(`Timeout setelah ${settings.timeoutMs} ms.`);
    throw new CorsOrNetworkError(
      "Browser tidak bisa menyelesaikan request ini. Penyebab paling umum: server tujuan tidak mengizinkan CORS, alamat tidak bisa dijangkau, atau sertifikat TLS ditolak.",
    );
  }
  if (res.type === "opaqueredirect") {
    notes.push("Redirect tidak diikuti (follow redirects mati). Browser menyembunyikan detail redirect pada mode Direct.");
  }
  const body = req.method === "HEAD" ? "" : await res.text();
  const total = Math.round(performance.now() - started);
  notes.push("Mode Direct: browser hanya menampilkan header response yang diizinkan CORS.");
  return {
    status: res.status,
    statusText: res.statusText,
    headers: [...res.headers.entries()],
    body,
    size: byteLength(body),
    timings: { total },
    url: res.url || req.url,
    executor: "direct",
    notes,
  };
}

/* ---------------- Browser extension bridge ---------------- */

interface ExtMessage {
  source: "packetman-ext";
  type: "pong" | "response";
  id?: string;
  version?: string;
  response?: ResponseData;
  error?: string;
}

let extensionVersion: string | null | undefined;
const pending = new Map<string, { resolve: (r: ResponseData) => void; reject: (e: Error) => void }>();

if (typeof window !== "undefined") {
  window.addEventListener("message", (ev: MessageEvent<ExtMessage>) => {
    if (ev.source !== window || ev.data?.source !== "packetman-ext") return;
    if (ev.data.type === "pong") extensionVersion = ev.data.version ?? "unknown";
    if (ev.data.type === "response" && ev.data.id) {
      const p = pending.get(ev.data.id);
      if (!p) return;
      pending.delete(ev.data.id);
      if (ev.data.error) p.reject(new Error(ev.data.error));
      else if (ev.data.response) p.resolve({ ...ev.data.response, executor: "extension" });
    }
  });
}

/** Ping the Packetman Interceptor extension. Resolves to its version, or null when absent. */
export function detectExtension(timeoutMs = 400): Promise<string | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (extensionVersion) return Promise.resolve(extensionVersion);
  window.postMessage({ source: "packetman-page", type: "ping" }, window.location.origin);
  return new Promise((resolve) => setTimeout(() => resolve(extensionVersion ?? null), timeoutMs));
}

export function sendViaExtension(req: ResolvedRequest, settings: RequestSettings): Promise<ResponseData> {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    window.postMessage({ source: "packetman-page", type: "send", id, request: req, settings }, window.location.origin);
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`Extension tidak merespons dalam ${settings.timeoutMs} ms.`));
      }
    }, settings.timeoutMs + 2000);
  });
}

/* ---------------- Cloud relay (opt-in) ---------------- */

export async function sendViaRelay(req: ResolvedRequest, settings: RequestSettings): Promise<ResponseData> {
  const payload = JSON.stringify({ request: req, timeoutMs: settings.timeoutMs, followRedirects: settings.followRedirects });
  const { response, entryId } = await egressFetch("relay", "/api/relay", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    purpose: `Relay ${req.method} ke ${safeHost(req.url)}`,
    content: "Request kamu (URL, header, body) atas izinmu. Relay tidak menyimpan atau mencatat isinya.",
  });
  const text = await response.text();
  recordEgressBytesIn(entryId, byteLength(text));
  let data: ResponseData & { error?: string };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Relay mengembalikan response tidak valid (HTTP ${response.status}).`);
  }
  if (!response.ok || data.error) throw new Error(data.error ?? `Relay gagal (HTTP ${response.status}).`);
  return { ...data, executor: "relay", notes: [...(data.notes ?? []), "Dikirim lewat Packetman Relay atas izinmu."] };
}

export function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export type ExecutorMode = "auto" | ExecutorKind;
