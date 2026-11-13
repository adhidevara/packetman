import type { Collection, Environment, KeyValue, TreeNode, Variable } from "./model";

/**
 * Local secret scanner. Runs entirely on-device before import, export, share
 * and sync so that production credentials never travel in plaintext.
 */

export interface SecretPattern {
  id: string;
  label: string;
  regex: RegExp;
}

export const SECRET_PATTERNS: SecretPattern[] = [
  { id: "stripe_live", label: "Stripe live secret key", regex: /\b(?:sk|rk)_live_[0-9a-zA-Z]{16,}\b/ },
  { id: "stripe_test", label: "Stripe test secret key", regex: /\b(?:sk|rk)_test_[0-9a-zA-Z]{16,}\b/ },
  { id: "midtrans_server", label: "Midtrans Server Key", regex: /\b(?:SB-)?Mid-server-[0-9A-Za-z_-]{12,}\b/ },
  { id: "xendit", label: "Xendit secret key", regex: /\bxnd_(?:production|development)_[0-9A-Za-z]{20,}\b/ },
  { id: "aws_access_key", label: "AWS access key ID", regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: "github_token", label: "GitHub token", regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[0-9A-Za-z]{30,}\b|\bgithub_pat_[0-9A-Za-z_]{40,}\b/ },
  { id: "slack_token", label: "Slack token", regex: /\bxox[abprs]-[0-9A-Za-z-]{10,}\b/ },
  { id: "google_api_key", label: "Google API key", regex: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: "openai_key", label: "OpenAI API key", regex: /\bsk-(?:proj-)?[0-9A-Za-z_-]{32,}\b/ },
  { id: "anthropic_key", label: "Anthropic API key", regex: /\bsk-ant-[0-9A-Za-z_-]{32,}\b/ },
  { id: "jwt", label: "JSON Web Token", regex: /\beyJ[0-9A-Za-z_-]{8,}\.eyJ[0-9A-Za-z_-]{8,}\.[0-9A-Za-z_-]{8,}\b/ },
  { id: "private_key", label: "Private key (PEM)", regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
];

const SENSITIVE_NAME = /(pass(word|wd)?|secret|token|api[_-]?key|apikey|private[_-]?key|client[_-]?secret|server[_-]?key|access[_-]?key|auth)/i;

export function detectSecret(value: string): SecretPattern | undefined {
  if (!value || value.includes("{{")) return undefined;
  return SECRET_PATTERNS.find((p) => p.regex.test(value));
}

export function isSensitiveName(name: string): boolean {
  return SENSITIVE_NAME.test(name);
}

export interface SecretFinding {
  location: string;
  field: string;
  pattern: string;
  /** Masked preview, e.g. "sk_live_…a1B2". */
  preview: string;
  /** Present when the finding is a variable that could be converted to type "secret". */
  variableId?: string;
}

export function maskSecret(value: string): string {
  if (value.length <= 8) return "•".repeat(value.length);
  return `${value.slice(0, Math.min(8, Math.floor(value.length / 3)))}…${value.slice(-4)}`;
}

function scanVariables(vars: Variable[], location: string, out: SecretFinding[]) {
  for (const v of vars) {
    if (v.type === "secret") continue;
    const hit = detectSecret(v.value);
    if (hit) out.push({ location, field: v.key, pattern: hit.label, preview: maskSecret(v.value), variableId: v.id });
    else if (v.value && !v.value.includes("{{") && isSensitiveName(v.key))
      out.push({ location, field: v.key, pattern: "Nama variabel sensitif", preview: maskSecret(v.value), variableId: v.id });
  }
}

function scanKv(list: KeyValue[], location: string, kind: string, out: SecretFinding[]) {
  for (const kv of list) {
    const hit = detectSecret(kv.value);
    if (hit) out.push({ location, field: `${kind}: ${kv.key}`, pattern: hit.label, preview: maskSecret(kv.value) });
  }
}

function scanNodes(items: TreeNode[], path: string, out: SecretFinding[]) {
  for (const n of items) {
    const loc = `${path} / ${n.name}`;
    if (n.type === "folder") {
      scanNodes(n.items, loc, out);
      continue;
    }
    scanKv(n.headers, loc, "Header", out);
    scanKv(n.params, loc, "Param", out);
    if (n.auth.type === "bearer") {
      const hit = detectSecret(n.auth.token);
      if (hit || (n.auth.token && !n.auth.token.includes("{{")))
        out.push({ location: loc, field: "Auth: Bearer token", pattern: hit?.label ?? "Token ditulis langsung (bukan variabel)", preview: maskSecret(n.auth.token) });
    }
    if (n.auth.type === "basic" && n.auth.password && !n.auth.password.includes("{{"))
      out.push({ location: loc, field: "Auth: Basic password", pattern: "Password ditulis langsung (bukan variabel)", preview: maskSecret(n.auth.password) });
    if (n.auth.type === "oauth2" && n.auth.clientSecret && !n.auth.clientSecret.includes("{{"))
      out.push({ location: loc, field: "Auth: OAuth2 client secret", pattern: "Client secret ditulis langsung (bukan variabel)", preview: maskSecret(n.auth.clientSecret) });
    if (n.auth.type === "apikey") {
      const hit = detectSecret(n.auth.value);
      if (hit) out.push({ location: loc, field: `Auth: API key ${n.auth.key}`, pattern: hit.label, preview: maskSecret(n.auth.value) });
    }
    if (n.body.mode === "raw") {
      const hit = detectSecret(n.body.raw);
      if (hit) out.push({ location: loc, field: "Body", pattern: hit.label, preview: "(di dalam body)" });
    }
  }
}

export function scanCollection(collection: Collection): SecretFinding[] {
  const out: SecretFinding[] = [];
  scanVariables(collection.variables, collection.name, out);
  scanNodes(collection.items, collection.name, out);
  return out;
}

export function scanEnvironment(env: Environment): SecretFinding[] {
  const out: SecretFinding[] = [];
  scanVariables(env.values, `Environment: ${env.name}`, out);
  return out;
}

/** Mark the given variables as secret (value stays local, never exported or synced). */
export function markVariablesSecret<T extends { values?: Variable[]; variables?: Variable[] }>(owner: T, ids: Set<string>): T {
  const fix = (vars: Variable[]) => vars.map((v) => (ids.has(v.id) ? { ...v, type: "secret" as const } : v));
  return {
    ...owner,
    ...(owner.values ? { values: fix(owner.values) } : {}),
    ...(owner.variables ? { variables: fix(owner.variables) } : {}),
  };
}
