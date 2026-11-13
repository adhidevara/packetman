import {
  defaultOAuth2,
  defaultSettings,
  newCollection,
  newEnvironment,
  newId,
  newKeyValue,
  type Auth,
  type Collection,
  type Environment,
  type FolderNode,
  type KeyValue,
  type RawLanguage,
  type RequestBody,
  type RequestNode,
  type Scripts,
  type TreeNode,
  type Variable,
} from "../model";

/* Postman Collection v2.0 / v2.1 importer & v2.1 exporter (public schema). */

type Json = Record<string, unknown>;

export interface ImportResult<T> {
  value: T;
  warnings: string[];
}

const SCHEMA_V21 = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";

function str(v: unknown): string {
  if (v === undefined || v === null) return "";
  return typeof v === "string" ? v : typeof v === "object" ? JSON.stringify(v) : String(v);
}

function desc(v: unknown): string | undefined {
  if (!v) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "object" && "content" in (v as Json)) return str((v as Json).content);
  return undefined;
}

function asArray(v: unknown): Json[] {
  return Array.isArray(v) ? (v as Json[]) : [];
}

function kvList(v: unknown): KeyValue[] {
  return asArray(v).map((h) => ({
    ...newKeyValue(str(h.key), str(h.value), h.disabled !== true),
    description: desc(h.description),
  }));
}

function scriptsFrom(events: unknown): Scripts {
  const out: Scripts = { preRequest: "", postResponse: "" };
  for (const ev of asArray(events)) {
    const script = (ev.script ?? {}) as Json;
    const exec = script.exec;
    const code = Array.isArray(exec) ? exec.map(str).join("\n") : str(exec);
    if (ev.listen === "prerequest") out.preRequest = code;
    else if (ev.listen === "test") out.postResponse = code;
  }
  return out;
}

/** Postman v2.1 stores auth params as [{key, value}], v2.0 as {key: value}. */
function authParams(raw: unknown): Record<string, string> {
  if (Array.isArray(raw)) {
    const out: Record<string, string> = {};
    for (const p of raw as Json[]) out[str(p.key)] = str(p.value);
    return out;
  }
  if (raw && typeof raw === "object") {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Json)) out[k] = str(v);
    return out;
  }
  return {};
}

function authFrom(raw: unknown, warnings: string[], where: string, fallback: Auth): Auth {
  if (!raw || typeof raw !== "object") return fallback;
  const a = raw as Json;
  const type = str(a.type);
  const p = authParams(a[type]);
  switch (type) {
    case "noauth":
      return { type: "none" };
    case "bearer":
      return { type: "bearer", token: p.token ?? "" };
    case "basic":
      return { type: "basic", username: p.username ?? "", password: p.password ?? "" };
    case "apikey":
      return { type: "apikey", key: p.key ?? "", value: p.value ?? "", in: p.in === "query" ? "query" : "header" };
    case "oauth2": {
      const grant = p.grant_type ?? "authorization_code";
      const supported = grant === "authorization_code" || grant === "authorization_code_with_pkce" || grant === "client_credentials";
      if (!supported) {
        warnings.push(`${where}: OAuth2 grant "${grant}" belum didukung; access token yang ada dipakai sebagai Bearer.`);
        return p.accessToken ? { type: "bearer", token: p.accessToken } : { type: "none" };
      }
      return {
        ...defaultOAuth2(),
        grantType: grant === "client_credentials" ? "client_credentials" : "authorization_code",
        usePkce: grant === "authorization_code_with_pkce",
        authUrl: p.authUrl ?? "",
        tokenUrl: p.accessTokenUrl ?? "",
        clientId: p.clientId ?? "",
        clientSecret: p.clientSecret ?? "",
        scope: p.scope ?? "",
        clientAuth: p.client_authentication === "header" ? "basic" : "body",
        headerPrefix: p.headerPrefix || "Bearer",
        accessToken: p.accessToken ?? "",
      };
    }
    case "":
      return fallback;
    default:
      warnings.push(`${where}: auth "${type}" belum didukung di MVP, diganti "none".`);
      return { type: "none" };
  }
}

function urlFrom(raw: unknown): { url: string; params: KeyValue[] } {
  if (typeof raw === "string") return { url: raw, params: [] };
  if (!raw || typeof raw !== "object") return { url: "", params: [] };
  const u = raw as Json;
  const params = kvList(u.query);
  let url = str(u.raw);
  if (!url) {
    const protocol = u.protocol ? `${str(u.protocol)}://` : "";
    const host = Array.isArray(u.host) ? u.host.map(str).join(".") : str(u.host);
    const port = u.port ? `:${str(u.port)}` : "";
    const path = Array.isArray(u.path) ? "/" + u.path.map(str).join("/") : u.path ? str(u.path) : "";
    url = protocol + host + port + path;
  }
  return { url, params };
}

function bodyFrom(raw: unknown, warnings: string[], where: string): RequestBody {
  if (!raw || typeof raw !== "object") return { mode: "none" };
  const b = raw as Json;
  switch (b.mode) {
    case "raw": {
      const lang = str(((b.options as Json | undefined)?.raw as Json | undefined)?.language) as RawLanguage;
      const language: RawLanguage = ["json", "text", "xml", "html", "javascript"].includes(lang) ? lang : "text";
      return { mode: "raw", language, raw: str(b.raw) };
    }
    case "urlencoded":
      return { mode: "urlencoded", fields: kvList(b.urlencoded) };
    case "formdata": {
      const fields = asArray(b.formdata).filter((f) => {
        if (f.type === "file") {
          warnings.push(`${where}: field form-data file "${str(f.key)}" dilewati (upload file belum didukung).`);
          return false;
        }
        return true;
      });
      return { mode: "formdata", fields: kvList(fields).map((f) => ({ ...f, kind: "text" as const })) };
    }
    case "graphql": {
      const g = (b.graphql ?? {}) as Json;
      let variables: unknown = {};
      try {
        variables = typeof g.variables === "string" && g.variables.trim() ? JSON.parse(g.variables) : (g.variables ?? {});
      } catch {
        variables = {};
      }
      warnings.push(`${where}: body GraphQL dikonversi ke raw JSON.`);
      return { mode: "raw", language: "json", raw: JSON.stringify({ query: str(g.query), variables }, null, 2) };
    }
    case "file":
      warnings.push(`${where}: body binary/file dilewati (belum didukung).`);
      return { mode: "none" };
    default:
      return { mode: "none" };
  }
}

function variablesFrom(raw: unknown): Variable[] {
  return asArray(raw).map((v) => ({
    id: newId(),
    key: str(v.key),
    value: str(v.value),
    type: v.type === "secret" ? "secret" : "default",
    enabled: v.disabled !== true && v.enabled !== false,
    description: desc(v.description),
  }));
}

function itemFrom(raw: Json, warnings: string[], path: string): TreeNode {
  const name = str(raw.name) || "Untitled";
  const where = path ? `${path} / ${name}` : name;
  if (Array.isArray(raw.item)) {
    const folder: FolderNode = {
      type: "folder",
      id: newId(),
      name,
      description: desc(raw.description),
      auth: authFrom(raw.auth, warnings, where, { type: "inherit" }),
      scripts: scriptsFrom(raw.event),
      items: (raw.item as Json[]).map((child) => itemFrom(child, warnings, where)),
    };
    return folder;
  }
  const req = (typeof raw.request === "string" ? { url: raw.request, method: "GET" } : (raw.request ?? {})) as Json;
  const { url, params } = urlFrom(req.url);
  const node: RequestNode = {
    type: "request",
    id: newId(),
    name,
    method: (str(req.method) || "GET").toUpperCase(),
    url,
    params,
    headers: kvList(req.header),
    body: bodyFrom(req.body, warnings, where),
    auth: authFrom(req.auth, warnings, where, { type: "inherit" }),
    scripts: scriptsFrom(raw.event),
    settings: defaultSettings(),
    description: desc(req.description) ?? desc(raw.description),
  };
  return node;
}

export function isPostmanCollection(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as Json;
  const info = d.info as Json | undefined;
  return !!info && typeof info.schema === "string" && info.schema.includes("schema.getpostman.com") && Array.isArray(d.item);
}

export function isPostmanEnvironment(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as Json;
  return Array.isArray(d.values) && typeof d.name === "string" && !d.info;
}

export function importPostmanCollection(data: unknown): ImportResult<Collection> {
  if (!isPostmanCollection(data)) throw new Error("Bukan file Postman Collection v2.0/v2.1 yang valid.");
  const d = data as Json;
  const info = d.info as Json;
  const warnings: string[] = [];
  const collection = newCollection(str(info.name) || "Imported Collection");
  collection.description = desc(info.description);
  collection.auth = authFrom(d.auth, warnings, "collection", { type: "none" });
  collection.scripts = scriptsFrom(d.event);
  collection.variables = variablesFrom(d.variable);
  collection.items = (d.item as Json[]).map((it) => itemFrom(it, warnings, ""));
  return { value: collection, warnings };
}

export function importPostmanEnvironment(data: unknown): ImportResult<Environment> {
  if (!isPostmanEnvironment(data)) throw new Error("Bukan file Postman Environment yang valid.");
  const d = data as Json;
  const env = newEnvironment(str(d.name) || "Imported Environment");
  env.values = variablesFrom(d.values);
  return { value: env, warnings: [] };
}

/* ---------- Export (v2.1) ---------- */

function kvOut(list: KeyValue[]) {
  return list.map((h) => ({ key: h.key, value: h.value, ...(h.enabled ? {} : { disabled: true }), ...(h.description ? { description: h.description } : {}) }));
}

function authOut(auth: Auth): Json | undefined {
  switch (auth.type) {
    case "inherit":
      return undefined;
    case "none":
      return { type: "noauth" };
    case "bearer":
      return { type: "bearer", bearer: [{ key: "token", value: auth.token, type: "string" }] };
    case "basic":
      return {
        type: "basic",
        basic: [
          { key: "username", value: auth.username, type: "string" },
          { key: "password", value: auth.password, type: "string" },
        ],
      };
    case "apikey":
      return {
        type: "apikey",
        apikey: [
          { key: "key", value: auth.key, type: "string" },
          { key: "value", value: auth.value, type: "string" },
          { key: "in", value: auth.in, type: "string" },
        ],
      };
    case "oauth2": {
      // Access/refresh tokens are local state and are never exported.
      const grant = auth.grantType === "client_credentials" ? "client_credentials" : auth.usePkce ? "authorization_code_with_pkce" : "authorization_code";
      const kv = (key: string, value: string) => ({ key, value, type: "string" });
      return {
        type: "oauth2",
        oauth2: [
          kv("grant_type", grant),
          kv("authUrl", auth.authUrl),
          kv("accessTokenUrl", auth.tokenUrl),
          kv("clientId", auth.clientId),
          kv("clientSecret", auth.clientSecret),
          kv("scope", auth.scope),
          kv("client_authentication", auth.clientAuth === "basic" ? "header" : "body"),
          kv("headerPrefix", auth.headerPrefix),
          kv("addTokenTo", "header"),
        ],
      };
    }
  }
}

function eventsOut(scripts: Scripts): Json[] | undefined {
  const out: Json[] = [];
  if (scripts.preRequest.trim()) out.push({ listen: "prerequest", script: { type: "text/javascript", exec: scripts.preRequest.split("\n") } });
  if (scripts.postResponse.trim()) out.push({ listen: "test", script: { type: "text/javascript", exec: scripts.postResponse.split("\n") } });
  return out.length ? out : undefined;
}

function bodyOut(body: RequestBody): Json | undefined {
  switch (body.mode) {
    case "none":
      return undefined;
    case "raw":
      return { mode: "raw", raw: body.raw, options: { raw: { language: body.language } } };
    case "urlencoded":
      return { mode: "urlencoded", urlencoded: kvOut(body.fields) };
    case "formdata":
      return { mode: "formdata", formdata: kvOut(body.fields).map((f) => ({ ...f, type: "text" })) };
  }
}

function itemOut(node: TreeNode): Json {
  if (node.type === "folder") {
    return clean({ name: node.name, description: node.description, auth: authOut(node.auth), event: eventsOut(node.scripts), item: node.items.map(itemOut) });
  }
  return clean({
    name: node.name,
    event: eventsOut(node.scripts),
    request: clean({
      method: node.method,
      header: kvOut(node.headers),
      body: bodyOut(node.body),
      url: { raw: node.url, query: node.params.length ? kvOut(node.params) : undefined },
      auth: authOut(node.auth),
      description: node.description,
    }),
  });
}

function clean(obj: Json): Json {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

/**
 * Export to Postman v2.1. Secret variables are exported with an empty value:
 * only names travel, never secret values (Janji Privasi).
 */
export function exportPostmanCollection(collection: Collection): Json {
  return clean({
    info: { _postman_id: collection.id, name: collection.name, description: collection.description, schema: SCHEMA_V21 },
    auth: authOut(collection.auth),
    event: eventsOut(collection.scripts),
    variable: collection.variables.map((v) => ({ key: v.key, value: v.type === "secret" ? "" : v.value, type: v.type === "secret" ? "secret" : "default", ...(v.enabled ? {} : { disabled: true }) })),
    item: collection.items.map(itemOut),
  });
}

export function exportPostmanEnvironment(env: Environment): Json {
  return {
    id: env.id,
    name: env.name,
    values: env.values.map((v) => ({ key: v.key, value: v.type === "secret" ? "" : v.value, type: v.type, enabled: v.enabled })),
    _postman_variable_scope: "environment",
  };
}
