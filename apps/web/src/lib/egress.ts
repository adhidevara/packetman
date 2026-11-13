"use client";

/**
 * Egress gate for Packetman's OWN network traffic (relay, and later sync, AI,
 * update checks). Every app-initiated connection must go through
 * `egressFetch`, which records it for the Egress Monitor and enforces policy.
 *
 * Requests the user sends to their API go through executors and are shown in
 * History/Console instead. ESLint forbids calling `fetch` directly elsewhere.
 */

export type EgressCategory = "relay" | "sync" | "ai" | "update" | "telemetry";

export interface EgressEntry {
  id: string;
  at: number;
  category: EgressCategory;
  host: string;
  purpose: string;
  bytesOut: number;
  bytesIn: number;
  /** What the payload contained, in plain words. */
  content: string;
  ok: boolean;
}

/** Categories that run without a user action. Packetman MVP has none. */
export const BACKGROUND_CATEGORIES: EgressCategory[] = ["sync", "update", "telemetry"];

type Listener = (entries: EgressEntry[]) => void;

let entries: EgressEntry[] = [];
const listeners = new Set<Listener>();
const blocked = new Set<EgressCategory>(["telemetry"]);

function emit() {
  for (const l of listeners) l(entries);
}

export function subscribeEgress(listener: Listener): () => void {
  listeners.add(listener);
  listener(entries);
  return () => listeners.delete(listener);
}

export function getEgressEntries(): EgressEntry[] {
  return entries;
}

export function setCategoryBlocked(category: EgressCategory, isBlocked: boolean) {
  if (isBlocked) blocked.add(category);
  else blocked.delete(category);
}

export class EgressBlockedError extends Error {
  constructor(category: EgressCategory) {
    super(`Koneksi kategori "${category}" diblokir oleh kebijakan egress.`);
  }
}

export async function egressFetch(
  category: EgressCategory,
  url: string,
  init: RequestInit & { purpose: string; content: string },
): Promise<{ response: Response; entryId: string }> {
  const target = new URL(url, typeof window !== "undefined" ? window.location.href : "http://localhost");
  if (blocked.has(category)) throw new EgressBlockedError(category);
  const { purpose, content, ...rest } = init;
  const bytesOut = typeof rest.body === "string" ? new TextEncoder().encode(rest.body).length : 0;
  const entry: EgressEntry = {
    id: crypto.randomUUID(),
    at: Date.now(),
    category,
    host: target.host,
    purpose,
    bytesOut,
    bytesIn: 0,
    content,
    ok: false,
  };
  entries = [entry, ...entries].slice(0, 500);
  emit();
  try {
    // eslint-disable-next-line no-restricted-globals -- the single sanctioned egress point
    const res = await fetch(target, rest);
    const len = Number(res.headers.get("content-length") ?? "0");
    entries = entries.map((e) => (e.id === entry.id ? { ...e, ok: res.ok, bytesIn: len } : e));
    emit();
    return { response: res, entryId: entry.id };
  } catch (err) {
    emit();
    throw err;
  }
}

export function recordEgressBytesIn(id: string, bytes: number) {
  entries = entries.map((e) => (e.id === id ? { ...e, bytesIn: bytes } : e));
  emit();
}
