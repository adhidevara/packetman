import { describe, expect, it } from "vitest";
import {
  buildRequest,
  emptyScopes,
  exportPostmanCollection,
  findVariableTokens,
  generateCode,
  importCurl,
  importPostmanCollection,
  importPostmanEnvironment,
  newCollection,
  newFolder,
  newKeyValue,
  newRequest,
  paramsFromUrl,
  resolveString,
  scanCollection,
  tokenizeShell,
  urlWithParams,
  type VariableScopes,
} from "../src";

// Fake credentials are assembled at runtime so no secret-shaped literal lives in the repo
// (keeps GitHub push protection and other secret scanners quiet).
const fakeKey = (...parts: string[]) => parts.join("_");

function scopes(partial: Partial<VariableScopes>): VariableScopes {
  return { ...emptyScopes(), ...partial };
}

describe("variables", () => {
  it("resolves by scope priority: local > data > environment > collection > global", () => {
    const s = scopes({ global: { host: "g" }, collection: { host: "c" }, environment: { host: "e" } });
    expect(resolveString("{{host}}", s)).toBe("e");
    s.local.host = "l";
    expect(resolveString("{{host}}", s)).toBe("l");
  });

  it("leaves unknown variables untouched and resolves nested ones", () => {
    const s = scopes({ environment: { base: "https://{{domain}}", domain: "api.example.com" } });
    expect(resolveString("{{base}}/users/{{missing}}", s)).toBe("https://api.example.com/users/{{missing}}");
  });

  it("generates dynamic variables", () => {
    expect(resolveString("{{$guid}}", emptyScopes())).toMatch(/^[0-9a-f-]{36}$/);
    expect(Number(resolveString("{{$timestamp}}", emptyScopes()))).toBeGreaterThan(1_600_000_000);
  });

  it("finds tokens with defined/undefined state", () => {
    const t = findVariableTokens("{{a}}/{{b}}/{{$guid}}", scopes({ environment: { a: "1" } }));
    expect(t.map((x) => [x.name, x.defined])).toEqual([
      ["a", true],
      ["b", false],
      ["$guid", true],
    ]);
  });
});

describe("url <-> params", () => {
  it("parses and rebuilds query strings, keeping {{vars}} readable", () => {
    const params = paramsFromUrl("https://x.dev/a?page=1&q=hello%20world&token={{t}}");
    expect(params.map((p) => [p.key, p.value])).toEqual([
      ["page", "1"],
      ["q", "hello world"],
      ["token", "{{t}}"],
    ]);
    expect(urlWithParams("https://x.dev/a?old=1", params)).toBe("https://x.dev/a?page=1&q=hello%20world&token={{t}}");
  });
});

describe("buildRequest", () => {
  it("applies params, variables, inherited auth and content type", () => {
    const col = newCollection("c");
    col.auth = { type: "bearer", token: "{{token}}" };
    const folder = newFolder("f");
    const req = newRequest({
      method: "post",
      url: "{{base}}/users?expand=true",
      params: [newKeyValue("expand", "true"), newKeyValue("debug", "1", false)],
      body: { mode: "raw", language: "json", raw: '{"name":"{{name}}"}' },
    });
    const built = buildRequest(req, {
      scopes: scopes({ environment: { base: "api.example.com", token: "abc", name: "Budi" } }),
      ancestors: [folder],
      collection: col,
    });
    expect(built.method).toBe("POST");
    expect(built.url).toBe("https://api.example.com/users?expand=true");
    expect(built.headers).toContainEqual(["Authorization", "Bearer abc"]);
    expect(built.headers).toContainEqual(["Content-Type", "application/json"]);
    expect(built.body).toEqual({ kind: "text", text: '{"name":"Budi"}' });
  });

  it("encodes basic auth as UTF-8 and supports api key in query", () => {
    const basic = buildRequest(newRequest({ url: "localhost:3000", auth: { type: "basic", username: "andré", password: "p" } }), { scopes: emptyScopes() });
    expect(basic.url).toBe("http://localhost:3000");
    expect(basic.headers).toContainEqual(["Authorization", "Basic " + Buffer.from("andré:p", "utf8").toString("base64")]);
    const q = buildRequest(newRequest({ url: "https://x.dev/a?b=1", auth: { type: "apikey", key: "api_key", value: "k 1", in: "query" } }), { scopes: emptyScopes() });
    expect(q.url).toBe("https://x.dev/a?b=1&api_key=k%201");
  });
});

describe("postman import/export", () => {
  const sample = {
    info: { name: "Shop API", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
    auth: { type: "bearer", bearer: [{ key: "token", value: "{{token}}", type: "string" }] },
    variable: [{ key: "base", value: "https://api.shop.dev" }],
    item: [
      {
        name: "Users",
        item: [
          {
            name: "Create user",
            event: [{ listen: "test", script: { exec: ["pm.test('ok', () => {", "  pm.response.to.have.status(201);", "});"] } }],
            request: {
              method: "POST",
              header: [{ key: "X-Trace", value: "1", disabled: true }],
              body: { mode: "raw", raw: '{"a":1}', options: { raw: { language: "json" } } },
              url: { raw: "{{base}}/users?x=1", query: [{ key: "x", value: "1" }] },
            },
          },
        ],
      },
      { name: "Legacy", request: { method: "GET", url: "{{base}}/legacy", auth: { type: "oauth2", oauth2: [] } } },
    ],
  };

  it("imports folders, requests, scripts, auth and warns on unsupported auth", () => {
    const { value, warnings } = importPostmanCollection(sample);
    expect(value.name).toBe("Shop API");
    expect(value.auth).toEqual({ type: "bearer", token: "{{token}}" });
    const folder = value.items[0]!;
    expect(folder.type).toBe("folder");
    const req = folder.type === "folder" ? folder.items[0]! : undefined;
    expect(req?.type).toBe("request");
    if (req?.type === "request") {
      expect(req.method).toBe("POST");
      expect(req.headers[0]?.enabled).toBe(false);
      expect(req.scripts.postResponse).toContain("pm.response.to.have.status(201)");
      expect(req.body).toEqual({ mode: "raw", language: "json", raw: '{"a":1}' });
      expect(req.params.map((p) => p.key)).toEqual(["x"]);
    }
    expect(warnings.some((w) => w.includes("oauth2"))).toBe(true);
  });

  it("round-trips through v2.1 export without leaking secret values", () => {
    const { value } = importPostmanCollection(sample);
    value.variables.push({ id: "s", key: "stripe", value: fakeKey("sk", "live", "abcdefghijklmnopqrstuvwx"), type: "secret", enabled: true });
    const out = exportPostmanCollection(value) as { variable: { key: string; value: string }[] };
    expect(out.variable.find((v) => v.key === "stripe")?.value).toBe("");
    const again = importPostmanCollection(out).value;
    expect(again.items.length).toBe(2);
  });

  it("imports environments", () => {
    const { value } = importPostmanEnvironment({ name: "dev", values: [{ key: "token", value: "x", type: "secret", enabled: true }] });
    expect(value.values[0]).toMatchObject({ key: "token", type: "secret" });
  });
});

describe("curl import", () => {
  it("tokenizes quotes and continuations", () => {
    expect(tokenizeShell(`curl -H 'A: b c' \\\n  "https://x.dev/?q=\\"1\\""`)).toEqual(["curl", "-H", "A: b c", 'https://x.dev/?q="1"']);
  });

  it("parses method, headers, json body and bearer auth", () => {
    const r = importCurl(`curl -X PUT 'https://api.dev/u/1?v=2' -H 'Content-Type: application/json' -H 'Authorization: Bearer xyz' --data-raw '{"a":1}'`);
    expect(r.method).toBe("PUT");
    expect(r.auth).toEqual({ type: "bearer", token: "xyz" });
    expect(r.body).toEqual({ mode: "raw", language: "json", raw: '{"a":1}' });
    expect(r.params.map((p) => [p.key, p.value])).toEqual([["v", "2"]]);
  });

  it("defaults to POST with -d and parses basic auth and form fields", () => {
    const r = importCurl(`curl https://api.dev/login -u user:pa:ss -F name=Budi -F age=3`);
    expect(r.method).toBe("POST");
    expect(r.auth).toEqual({ type: "basic", username: "user", password: "pa:ss" });
    expect(r.body.mode).toBe("formdata");
  });
});

describe("codegen", () => {
  const built = buildRequest(
    newRequest({ method: "POST", url: "https://api.dev/it's", headers: [newKeyValue("X-A", "1")], body: { mode: "raw", language: "json", raw: '{"a":"b"}' } }),
    { scopes: emptyScopes() },
  );

  it("escapes single quotes for shell", () => {
    expect(generateCode("curl", built)).toContain(`'https://api.dev/it'\\''s'`);
  });

  it("generates every language without throwing", () => {
    for (const lang of ["curl", "fetch", "axios", "python", "go"] as const) {
      expect(generateCode(lang, built).length).toBeGreaterThan(20);
    }
  });
});

describe("secret scanner", () => {
  it("flags payment keys and hard-coded tokens, ignores {{variables}}", () => {
    const col = newCollection("c");
    col.variables.push({ id: "1", key: "midtrans", value: ["SB", "Mid", "server", "AbCdEfGhIjKlMnOp"].join("-"), type: "default", enabled: true });
    col.variables.push({ id: "2", key: "base", value: "https://api.dev", type: "default", enabled: true });
    col.items.push(newRequest({ auth: { type: "bearer", token: "{{token}}" }, headers: [newKeyValue("X-Key", fakeKey("sk", "live", "1234567890abcdefghij"))] }));
    const findings = scanCollection(col);
    expect(findings.map((f) => f.pattern)).toEqual(["Midtrans Server Key", "Stripe live secret key"]);
    expect(findings[0]?.variableId).toBe("1");
    expect(findings.every((f) => !f.preview.includes("1234567890"))).toBe(true);
  });
});
