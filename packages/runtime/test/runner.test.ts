import variant from "@jitl/quickjs-singlefile-mjs-release-sync";
import { emptyScopes, newCollection, newFolder, newRequest, type ResponseData } from "@packetman/core";
import { beforeAll, describe, expect, it } from "vitest";
import { newQuickJSWASMModuleFromVariant, runCollection, toJUnit, type QuickJSWASMModule } from "../src";

let quickjs: QuickJSWASMModule;
beforeAll(async () => {
  quickjs = await newQuickJSWASMModuleFromVariant(variant);
});

const ok = (body: unknown): ResponseData => ({
  status: 200,
  statusText: "OK",
  headers: [],
  body: JSON.stringify(body),
  size: 10,
  timings: { total: 3 },
  executor: "direct",
});

function shop() {
  const c = newCollection("Shop");
  const login = newRequest({
    name: "Login",
    method: "POST",
    url: "https://api.dev/login",
    body: { mode: "raw", language: "json", raw: '{"email":"{{email}}"}' },
    scripts: { preRequest: "", postResponse: 'pm.environment.set("token", pm.response.json().token); pm.test("token", () => pm.expect(pm.response.json().token).to.be.a("string"));' },
  });
  const folder = newFolder("Orders");
  const list = newRequest({
    name: "List orders",
    url: "https://api.dev/orders",
    auth: { type: "bearer", token: "{{token}}" },
    scripts: { preRequest: "", postResponse: 'pm.test("200", () => pm.response.to.have.status(200));' },
  });
  folder.items = [list];
  c.items = [login, folder];
  return { c, login, list, folder };
}

describe("collection runner", () => {
  it("runs every request per iteration, feeds data rows and carries env vars", async () => {
    const { c } = shop();
    const sent: { url: string; auth?: string; body?: string }[] = [];
    const summary = await runCollection({
      quickjs,
      collection: c,
      iterations: 2,
      data: [{ email: "budi@x.id" }, { email: "siti@x.id" }],
      scopes: emptyScopes(),
      send: async (r) => {
        sent.push({ url: r.url, auth: r.headers.find(([k]) => k === "Authorization")?.[1], body: r.body.kind === "text" ? r.body.text : undefined });
        return r.url.endsWith("/login") ? ok({ token: `t-${sent.length}` }) : ok([]);
      },
    });
    expect(summary.stopped).toBe("completed");
    expect(summary.totals).toMatchObject({ requests: 4, testsPassed: 4, testsFailed: 0, errors: 0 });
    expect(sent.map((s) => s.body ?? s.auth)).toEqual(['{"email":"budi@x.id"}', "Bearer t-1", '{"email":"siti@x.id"}', "Bearer t-3"]);
    expect(summary.scopes.environment.token).toBe("t-3");
    expect(summary.scopes.data).toEqual({});
  });

  it("supports setNextRequest jumps, null stop and a loop guard", async () => {
    const { c, login } = shop();
    login.scripts.postResponse = 'pm.execution.setNextRequest(null);';
    const s1 = await runCollection({ quickjs, collection: c, iterations: 1, scopes: emptyScopes(), send: async () => ok({}) });
    expect(s1.items.map((i) => i.name)).toEqual(["Login"]);
    expect(s1.stopped).toBe("next-request-null");

    login.scripts.postResponse = 'pm.execution.setNextRequest("Login");';
    const s2 = await runCollection({ quickjs, collection: c, iterations: 1, scopes: emptyScopes(), maxStepsPerIteration: 5, send: async () => ok({}) });
    expect(s2.stopped).toBe("error");
    expect(s2.items.at(-1)?.error).toMatch(/langkah/);
  });

  it("runs a single folder, stops on error and aborts on signal", async () => {
    const { c, folder } = shop();
    const onlyFolder = await runCollection({ quickjs, collection: c, folderId: folder.id, iterations: 1, scopes: emptyScopes(), send: async () => ok([]) });
    expect(onlyFolder.items.map((i) => i.name)).toEqual(["List orders"]);

    const failing = await runCollection({
      quickjs,
      collection: c,
      iterations: 3,
      stopOnError: true,
      scopes: emptyScopes(),
      send: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    expect(failing.items).toHaveLength(1);
    expect(failing.items[0]?.error).toBe("ECONNREFUSED");

    const ctl = new AbortController();
    ctl.abort();
    const aborted = await runCollection({ quickjs, collection: c, iterations: 2, scopes: emptyScopes(), signal: ctl.signal, send: async () => ok({}) });
    expect(aborted.stopped).toBe("aborted");
    expect(aborted.items).toHaveLength(0);
  });

  it("produces a JUnit report", async () => {
    const { c } = shop();
    const summary = await runCollection({ quickjs, collection: c, iterations: 1, scopes: emptyScopes(), send: async (r) => (r.url.endsWith("/login") ? ok({ token: "x" }) : { ...ok([]), status: 500 }) });
    const xml = toJUnit(summary, "Shop <&>");
    expect(xml).toContain('<testsuites name="Shop &lt;&amp;&gt;" tests="2" failures="1"');
    expect(xml).toContain("<failure message=");
  });
});
