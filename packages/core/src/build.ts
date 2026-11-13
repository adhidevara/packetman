import { base64EncodeUtf8 } from "./encoding";
import type { Auth, Collection, FolderNode, RequestData, ResolvedRequest } from "./model";
import { withScheme } from "./url";
import { resolveString, type VariableScopes } from "./variables";

/** Walk request → folders → collection to find the effective auth. */
export function effectiveAuth(request: Pick<RequestData, "auth">, ancestors: FolderNode[], collection?: Pick<Collection, "auth">): Auth {
  if (request.auth.type !== "inherit") return request.auth;
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const a = ancestors[i]!.auth;
    if (a.type !== "inherit") return a;
  }
  if (collection && collection.auth.type !== "inherit") return collection.auth;
  return { type: "none" };
}

const RAW_CONTENT_TYPES: Record<string, string> = {
  json: "application/json",
  xml: "application/xml",
  html: "text/html",
  javascript: "application/javascript",
  text: "text/plain",
};

function hasHeader(headers: [string, string][], name: string): boolean {
  const lower = name.toLowerCase();
  return headers.some(([k]) => k.toLowerCase() === lower);
}

export interface BuildOptions {
  scopes: VariableScopes;
  ancestors?: FolderNode[];
  collection?: Pick<Collection, "auth">;
}

/**
 * Turn an editable request into a wire-ready request:
 * params → URL, {{variables}} resolved, auth applied, Content-Type added.
 */
export function buildRequest(request: RequestData, opts: BuildOptions): ResolvedRequest {
  const r = (s: string) => resolveString(s, opts.scopes);

  // The URL string is the source of truth for enabled query params (the editor
  // keeps it in sync via urlWithParams); disabled params live only in `params`.
  let url = withScheme(r(request.url));

  const headers: [string, string][] = request.headers
    .filter((h) => h.enabled && h.key.trim() !== "")
    .map((h) => [r(h.key.trim()), r(h.value)]);

  let body: ResolvedRequest["body"] = { kind: "none" };
  switch (request.body.mode) {
    case "raw": {
      body = { kind: "text", text: r(request.body.raw) };
      const ct = RAW_CONTENT_TYPES[request.body.language];
      if (ct && !hasHeader(headers, "content-type")) headers.push(["Content-Type", ct]);
      break;
    }
    case "urlencoded": {
      body = {
        kind: "urlencoded",
        fields: request.body.fields.filter((f) => f.enabled && f.key !== "").map((f) => [r(f.key), r(f.value)]),
      };
      if (!hasHeader(headers, "content-type")) headers.push(["Content-Type", "application/x-www-form-urlencoded"]);
      break;
    }
    case "formdata": {
      // Content-Type (with boundary) is set by the executor's FormData encoder.
      body = {
        kind: "formdata",
        fields: request.body.fields.filter((f) => f.enabled && f.key !== "").map((f) => [r(f.key), r(f.value)]),
      };
      break;
    }
    case "none":
      break;
  }

  const auth = effectiveAuth(request, opts.ancestors ?? [], opts.collection);
  switch (auth.type) {
    case "bearer":
      if (!hasHeader(headers, "authorization")) headers.push(["Authorization", `Bearer ${r(auth.token)}`]);
      break;
    case "basic":
      if (!hasHeader(headers, "authorization"))
        headers.push(["Authorization", `Basic ${base64EncodeUtf8(`${r(auth.username)}:${r(auth.password)}`)}`]);
      break;
    case "apikey": {
      const key = r(auth.key);
      const value = r(auth.value);
      if (!key) break;
      if (auth.in === "query") {
        url += (url.includes("?") ? "&" : "?") + `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
      } else if (!hasHeader(headers, key)) {
        headers.push([key, value]);
      }
      break;
    }
    case "oauth2": {
      const token = r(auth.accessToken);
      if (token && !hasHeader(headers, "authorization")) headers.push(["Authorization", `${auth.headerPrefix || "Bearer"} ${token}`.trim()]);
      break;
    }
    case "none":
    case "inherit":
      break;
  }

  return { method: (request.method || "GET").toUpperCase(), url, headers, body };
}

/** Serialize a resolved body to a string (urlencoded/text). Form-data is executor-specific. */
export function serializeBody(body: ResolvedRequest["body"]): string | undefined {
  switch (body.kind) {
    case "none":
      return undefined;
    case "text":
      return body.text;
    case "urlencoded":
      return new URLSearchParams(body.fields).toString();
    case "formdata":
      return undefined;
  }
}
