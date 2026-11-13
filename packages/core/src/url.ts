import { newKeyValue, type KeyValue } from "./model";

/**
 * URL <-> params sync helpers. They work on raw strings (which may contain
 * {{variables}}) rather than the WHATWG URL parser, which would reject them.
 */

export function splitUrl(url: string): { base: string; query: string; hash: string } {
  let rest = url;
  let hash = "";
  const hashIdx = rest.indexOf("#");
  if (hashIdx >= 0) {
    hash = rest.slice(hashIdx);
    rest = rest.slice(0, hashIdx);
  }
  const qIdx = rest.indexOf("?");
  if (qIdx < 0) return { base: rest, query: "", hash };
  return { base: rest.slice(0, qIdx), query: rest.slice(qIdx + 1), hash };
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}

/** Parse the query string of `url` into params, preserving existing ids/descriptions by position. */
export function paramsFromUrl(url: string, previous: KeyValue[] = []): KeyValue[] {
  const { query } = splitUrl(url);
  const disabled = previous.filter((p) => !p.enabled);
  if (!query) return disabled;
  const enabledPrev = previous.filter((p) => p.enabled);
  const parsed = query
    .split("&")
    .filter((part) => part.length > 0)
    .map((part, i) => {
      const eq = part.indexOf("=");
      const key = safeDecode(eq >= 0 ? part.slice(0, eq) : part);
      const value = safeDecode(eq >= 0 ? part.slice(eq + 1) : "");
      const prev = enabledPrev[i];
      return prev ? { ...prev, key, value, enabled: true } : newKeyValue(key, value);
    });
  return [...parsed, ...disabled];
}

function encodeQueryPart(s: string): string {
  // Keep {{variables}} readable; encode everything else that would break the query.
  return s
    .split(/(\{\{[^{}]*\}\})/g)
    .map((chunk) => (chunk.startsWith("{{") && chunk.endsWith("}}") ? chunk : encodeURIComponent(chunk).replace(/%2F/gi, "/").replace(/%3A/gi, ":").replace(/%40/gi, "@").replace(/%2C/gi, ",")))
    .join("");
}

/** Rebuild `url` so its query string matches the enabled params. */
export function urlWithParams(url: string, params: KeyValue[]): string {
  const { base, hash } = splitUrl(url);
  const query = params
    .filter((p) => p.enabled && p.key !== "")
    .map((p) => (p.value === "" ? encodeQueryPart(p.key) : `${encodeQueryPart(p.key)}=${encodeQueryPart(p.value)}`))
    .join("&");
  return base + (query ? "?" + query : "") + hash;
}

/** Ensure a scheme is present; defaults to http:// for localhost-ish hosts, https:// otherwise. */
export function withScheme(url: string): string {
  const trimmed = url.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  if (/^(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(trimmed)) return "http://" + trimmed;
  return "https://" + trimmed;
}
