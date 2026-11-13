import type { ResolvedRequest, ResponseData } from "@packetman/core";
import { lookup } from "node:dns";
import { Agent, fetch as undiciFetch, FormData as UndiciFormData } from "undici";
import { assertPublicUrl, isBlockedAddress, SsrfError } from "@/server/ssrf";

/**
 * Cloud Relay (opt-in). Executes a request server-side for targets the browser
 * cannot reach because of CORS. Stateless: request/response payloads are never
 * logged or stored. Only an in-memory rate-limit counter per client IP exists.
 */

const MAX_BODY_BYTES = 10 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 10;
const HOP_BY_HOP = new Set(["host", "connection", "content-length", "transfer-encoding", "keep-alive", "upgrade", "proxy-authorization", "proxy-connection", "te", "trailer"]);

const allowPrivate = process.env.PACKETMAN_RELAY_ALLOW_PRIVATE === "true";

// Re-check every resolved address at connect time (defeats DNS rebinding between check and connect).
const dispatcher = new Agent({
  connect: {
    // Node may ask for all addresses (happy eyeballs); validate every one it could connect to.
    lookup(hostname, options, callback) {
      const cb = callback as (err: NodeJS.ErrnoException | null, address: string | { address: string; family: number }[], family?: number) => void;
      lookup(hostname, options, (err, address, family) => {
        if (err) return cb(err, "", 0);
        const list = Array.isArray(address) ? address : [{ address: address as string, family: family as number }];
        const bad = allowPrivate ? undefined : list.find((a) => isBlockedAddress(a.address));
        if (bad) return cb(new SsrfError(`${hostname} mengarah ke alamat privat (${bad.address}).`), "", 0);
        if (Array.isArray(address)) cb(null, address);
        else cb(null, address as string, family as number);
      });
    },
  },
  headersTimeout: 60_000,
  bodyTimeout: 60_000,
});

const buckets = new Map<string, { tokens: number; at: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const b = buckets.get(ip) ?? { tokens: 60, at: now };
  b.tokens = Math.min(60, b.tokens + ((now - b.at) / 1000) * 1); // 60 burst, 1 req/s refill
  b.at = now;
  if (b.tokens < 1) {
    buckets.set(ip, b);
    return true;
  }
  b.tokens -= 1;
  buckets.set(ip, b);
  return false;
}

interface RelayBody {
  request: ResolvedRequest;
  timeoutMs?: number;
  followRedirects?: boolean;
}

function err(status: number, message: string) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

async function readLimited(res: Awaited<ReturnType<typeof undiciFetch>>): Promise<{ text: string; size: number; truncated: boolean }> {
  if (!res.body) return { text: "", size: 0, truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.byteLength;
  }
  return { text: new TextDecoder().decode(all), size: all.byteLength, truncated };
}

export async function POST(req: Request) {
  if (process.env.PACKETMAN_RELAY_ENABLED === "false") return err(503, "Relay dinonaktifkan di server ini.");

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip)) return err(429, "Terlalu banyak request lewat relay. Coba lagi sebentar.");

  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return err(413, "Body request melebihi 10 MB.");

  let body: RelayBody;
  try {
    body = (await req.json()) as RelayBody;
  } catch {
    return err(400, "Payload relay tidak valid.");
  }
  const r = body.request;
  if (!r || typeof r.url !== "string" || typeof r.method !== "string") return err(400, "Request tidak lengkap.");

  const headers = new Headers();
  for (const [k, v] of r.headers ?? []) {
    if (!k || HOP_BY_HOP.has(k.toLowerCase())) continue;
    try {
      headers.append(k, v);
    } catch {
      return err(400, `Header tidak valid: ${k}`);
    }
  }
  if (!headers.has("user-agent")) headers.set("User-Agent", "PacketmanRuntime/0.1");
  if (!headers.has("accept")) headers.set("Accept", "*/*");

  let payload: string | UndiciFormData | undefined;
  if (r.body?.kind === "text") payload = r.body.text;
  else if (r.body?.kind === "urlencoded") payload = new URLSearchParams(r.body.fields).toString();
  else if (r.body?.kind === "formdata") {
    const fd = new UndiciFormData();
    for (const [k, v] of r.body.fields) fd.append(k, v);
    payload = fd;
    headers.delete("content-type");
  }
  const method = r.method.toUpperCase();
  if (method === "GET" || method === "HEAD") payload = undefined;

  const timeoutMs = Math.min(Math.max(body.timeoutMs ?? 30_000, 1_000), 120_000);
  const signal = AbortSignal.timeout(timeoutMs);
  const started = performance.now();

  try {
    let url = (await assertPublicUrl(r.url)).toString();
    let currentMethod = method;
    let currentBody = payload;
    let res: Awaited<ReturnType<typeof undiciFetch>> | undefined;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      res = await undiciFetch(url, { method: currentMethod, headers, body: currentBody, redirect: "manual", signal, dispatcher });
      const location = res.headers.get("location");
      if (!body.followRedirects || res.status < 300 || res.status >= 400 || !location) break;
      url = (await assertPublicUrl(new URL(location, url).toString())).toString();
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && currentMethod === "POST")) {
        currentMethod = "GET";
        currentBody = undefined;
      }
      await res.body?.cancel();
    }
    if (!res) return err(502, "Tidak ada response.");

    const { text, size, truncated } = method === "HEAD" ? { text: "", size: 0, truncated: false } : await readLimited(res);
    const out: ResponseData = {
      status: res.status,
      statusText: res.statusText,
      headers: [...res.headers.entries()],
      body: text,
      size,
      timings: { total: Math.round(performance.now() - started) },
      url,
      executor: "relay",
      notes: truncated ? ["Response dipotong di 10 MB oleh relay."] : undefined,
    };
    return Response.json(out, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof SsrfError) return err(403, e.message);
    const cause = (e as { cause?: unknown }).cause;
    if (cause instanceof SsrfError) return err(403, cause.message);
    if ((e as Error).name === "TimeoutError" || (e as Error).name === "AbortError") return err(504, `Timeout setelah ${timeoutMs} ms.`);
    const msg = cause instanceof Error ? cause.message : (e as Error).message;
    return err(502, `Gagal menghubungi server tujuan: ${msg}`);
  }
}
