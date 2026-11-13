/**
 * Packetman collection model.
 *
 * A superset of the public Postman Collection v2.1 concepts, stored as one
 * document per collection (tree of folders and requests) so it maps cleanly
 * onto IndexedDB today and onto encrypted sync blobs later.
 */

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS"
  | (string & {});

export const HTTP_METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

export interface KeyValue {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  description?: string;
}

export interface FormDataField extends KeyValue {
  /** MVP supports text fields only; file fields are a later milestone. */
  kind: "text";
}

export type VariableType = "default" | "secret";

export interface Variable {
  id: string;
  key: string;
  /** Initial value: the value that is shared/synced with a team. */
  value: string;
  /** Current value: local only, never synced or exported. Falls back to `value`. */
  currentValue?: string;
  type: VariableType;
  enabled: boolean;
  description?: string;
}

export type RawLanguage = "json" | "text" | "xml" | "html" | "javascript";

export type RequestBody =
  | { mode: "none" }
  | { mode: "raw"; language: RawLanguage; raw: string }
  | { mode: "urlencoded"; fields: KeyValue[] }
  | { mode: "formdata"; fields: FormDataField[] };

export type Auth =
  | { type: "inherit" }
  | { type: "none" }
  | { type: "apikey"; key: string; value: string; in: "header" | "query" }
  | { type: "bearer"; token: string }
  | { type: "basic"; username: string; password: string };

export type AuthType = Auth["type"];

export interface Scripts {
  preRequest: string;
  postResponse: string;
}

export interface RequestSettings {
  followRedirects: boolean;
  timeoutMs: number;
}

export interface RequestData {
  name: string;
  method: HttpMethod;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  body: RequestBody;
  auth: Auth;
  scripts: Scripts;
  settings: RequestSettings;
  description?: string;
}

export interface RequestNode extends RequestData {
  type: "request";
  id: string;
}

export interface FolderNode {
  type: "folder";
  id: string;
  name: string;
  description?: string;
  auth: Auth;
  scripts: Scripts;
  items: TreeNode[];
}

export type TreeNode = FolderNode | RequestNode;

export interface Collection {
  id: string;
  name: string;
  description?: string;
  auth: Auth;
  scripts: Scripts;
  variables: Variable[];
  items: TreeNode[];
  createdAt: number;
  updatedAt: number;
}

export interface Environment {
  id: string;
  name: string;
  values: Variable[];
  createdAt: number;
  updatedAt: number;
}

/** A request after variables, auth and auto headers have been applied. */
export interface ResolvedRequest {
  method: string;
  url: string;
  headers: [string, string][];
  body:
    | { kind: "none" }
    | { kind: "text"; text: string }
    | { kind: "urlencoded"; fields: [string, string][] }
    | { kind: "formdata"; fields: [string, string][] };
}

export interface ResponseTimings {
  total: number;
}

export interface ResponseData {
  status: number;
  statusText: string;
  headers: [string, string][];
  /** Body decoded as UTF-8 text. Binary bodies are a later milestone. */
  body: string;
  size: number;
  timings: ResponseTimings;
  /** Final URL after redirects, when known. */
  url?: string;
  /** Which executor carried the request. */
  executor: ExecutorKind;
  /** Executor-specific caveats, e.g. "CORS hides some response headers". */
  notes?: string[];
}

export type ExecutorKind = "direct" | "extension" | "relay";

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function emptyScripts(): Scripts {
  return { preRequest: "", postResponse: "" };
}

export function defaultSettings(): RequestSettings {
  return { followRedirects: true, timeoutMs: 30000 };
}

export function newKeyValue(key = "", value = "", enabled = true): KeyValue {
  return { id: newId(), key, value, enabled };
}

export function newVariable(key = "", value = "", type: VariableType = "default"): Variable {
  return { id: newId(), key, value, type, enabled: true };
}

export function newRequest(partial: Partial<RequestData> = {}): RequestNode {
  return {
    type: "request",
    id: newId(),
    name: partial.name ?? "New Request",
    method: partial.method ?? "GET",
    url: partial.url ?? "",
    params: partial.params ?? [],
    headers: partial.headers ?? [],
    body: partial.body ?? { mode: "none" },
    auth: partial.auth ?? { type: "inherit" },
    scripts: partial.scripts ?? emptyScripts(),
    settings: partial.settings ?? defaultSettings(),
    description: partial.description,
  };
}

export function newFolder(name = "New Folder"): FolderNode {
  return { type: "folder", id: newId(), name, auth: { type: "inherit" }, scripts: emptyScripts(), items: [] };
}

export function newCollection(name = "New Collection"): Collection {
  const now = Date.now();
  return {
    id: newId(),
    name,
    auth: { type: "none" },
    scripts: emptyScripts(),
    variables: [],
    items: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function newEnvironment(name = "New Environment"): Environment {
  const now = Date.now();
  return { id: newId(), name, values: [], createdAt: now, updatedAt: now };
}

/** Effective value used at runtime: current value when set, otherwise initial value. */
export function effectiveValue(v: Variable): string {
  return v.currentValue !== undefined && v.currentValue !== "" ? v.currentValue : v.value;
}
