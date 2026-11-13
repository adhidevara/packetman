import { generateDynamic } from "./dynamic";
import { effectiveValue, type Variable } from "./model";

/**
 * Variable scopes, highest priority first:
 * local (set by scripts) > data (iteration file) > environment > collection > global.
 */
export type ScopeName = "local" | "data" | "environment" | "collection" | "global";

export const SCOPE_ORDER: ScopeName[] = ["local", "data", "environment", "collection", "global"];

export type ScopeValues = Record<string, string>;

export interface VariableScopes {
  local: ScopeValues;
  data: ScopeValues;
  environment: ScopeValues;
  collection: ScopeValues;
  global: ScopeValues;
}

export function emptyScopes(): VariableScopes {
  return { local: {}, data: {}, environment: {}, collection: {}, global: {} };
}

/** Flatten enabled variables into a key → effective value map. Later duplicates win. */
export function variablesToMap(vars: Variable[] | undefined): ScopeValues {
  const out: ScopeValues = {};
  for (const v of vars ?? []) {
    if (v.enabled && v.key) out[v.key] = effectiveValue(v);
  }
  return out;
}

export interface VariableLookup {
  value: string;
  scope: ScopeName | "dynamic";
}

export function lookupVariable(name: string, scopes: VariableScopes): VariableLookup | undefined {
  if (name.startsWith("$")) {
    const dyn = generateDynamic(name);
    if (dyn !== undefined) return { value: dyn, scope: "dynamic" };
  }
  for (const scope of SCOPE_ORDER) {
    const values = scopes[scope];
    if (Object.prototype.hasOwnProperty.call(values, name)) return { value: values[name]!, scope };
  }
  return undefined;
}

const VAR_PATTERN = /\{\{\s*([^{}\s][^{}]*?)\s*\}\}/g;

/**
 * Replace {{name}} placeholders. Unknown variables are left untouched, like Postman.
 * Values may themselves contain placeholders; resolution repeats up to `depth` times.
 */
export function resolveString(input: string, scopes: VariableScopes, depth = 5): string {
  let current = input;
  for (let i = 0; i < depth; i++) {
    let changed = false;
    current = current.replace(VAR_PATTERN, (match, rawName: string) => {
      const hit = lookupVariable(rawName.trim(), scopes);
      if (!hit) return match;
      changed = true;
      return hit.value;
    });
    if (!changed) break;
  }
  return current;
}

export interface VariableToken {
  start: number;
  end: number;
  name: string;
  defined: boolean;
  scope?: ScopeName | "dynamic";
}

/** Locate {{placeholders}} in a string, for UI highlighting. Does not generate dynamic values. */
export function findVariableTokens(input: string, scopes: VariableScopes): VariableToken[] {
  const tokens: VariableToken[] = [];
  for (const m of input.matchAll(VAR_PATTERN)) {
    const name = m[1]!.trim();
    let scope: VariableToken["scope"];
    if (name.startsWith("$")) {
      scope = generateDynamic(name) !== undefined ? "dynamic" : undefined;
    } else {
      scope = SCOPE_ORDER.find((s) => Object.prototype.hasOwnProperty.call(scopes[s], name));
    }
    tokens.push({ start: m.index!, end: m.index! + m[0].length, name, defined: scope !== undefined, scope });
  }
  return tokens;
}
