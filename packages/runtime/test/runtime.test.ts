import variant from "@jitl/quickjs-singlefile-mjs-release-sync";
import { emptyScopes, newCollection, newKeyValue, newRequest, type ResponseData } from "@packetman/core";
import { beforeAll, describe, expect, it } from "vitest";
import { executeRequest, newQuickJSWASMModuleFromVariant, runScript, type QuickJSWASMModule, type ScriptInput } from "../src";

let quickjs: QuickJSWASMModule;
beforeAll(async () => {
  quickjs = await newQuickJSWASMModuleFromVariant(variant);
});

const baseInput = (code: string, extra: Partial<ScriptInput> = {}): ScriptInput => ({
  event: "test",
  code,
  variables: emptyScopes(),
  request: { method: "GET", url: "https://api.dev/users", headers: [], body: { mode: "none" } },
  response: {
    code: 200,
    status: "OK",
    headers: [["Content-Type", "application/json"]],
    body: JSON.stringify({ data: [{ id: 1, name: "Budi" }], total: 1 }),
    responseTime: 42,
    responseSize: 64,
  },
  info: { requestName: "List users", requestId: "r1", iteration: 0, iterationCount: 1 },
  ...extra,
});

describe("sandbox", () => {
  it("runs Postman-style tests and assertions", () => {
    const out = runScript(
      quickjs,
      baseInput(`
        pm.test("status 200", () => pm.response.to.have.status(200));
        pm.test("is ok + json", () => { pm.response.to.be.ok; pm.response.to.be.json; });
        pm.test("body shape", () => {
          const json = pm.response.json();
          pm.expect(json).to.have.property("data").that.is.an("array").with.lengthOf(1);
          pm.expect(json.data[0]).to.deep.include({ name: "Budi" });
          pm.expect(json.total).to.be.above(0).and.below(10);
          pm.expect(pm.response.headers.get("content-type")).to.include("json");
        });
        pm.test("fails", () => pm.expect(1).to.equal(2));
        pm.test("not", () => pm.expect("abc").to.not.include("z"));
        tests["legacy works"] = responseCode.code === 200;
      `),
    );
    expect(out.error).toBeNull();
    expect(out.tests.map((t) => [t.name, t.passed])).toEqual([
      ["status 200", true],
      ["is ok + json", true],
      ["body shape", true],
      ["fails", false],
      ["not", true],
      ["legacy works", true],
    ]);
    expect(out.tests[3]?.error).toBe("expected 1 to equal 2");
  });

  it("reads and writes variable scopes with correct priority", () => {
    const vars = emptyScopes();
    vars.environment.base = "https://env";
    vars.collection.base = "https://col";
    vars.global.g = "1";
    const out = runScript(
      quickjs,
      baseInput(
        `
        pm.environment.set("token", pm.response.json().data[0].id);
        pm.collectionVariables.set("seen", true);
        pm.globals.unset("g");
        pm.variables.set("local", "x");
        console.log("base is", pm.variables.get("base"), { env: pm.environment.name });
      `,
        { variables: vars, environmentName: "dev" },
      ),
    );
    expect(out.variables.environment.token).toBe("1");
    expect(out.variables.collection.seen).toBe("true");
    expect(out.variables.global).toEqual({});
    expect(out.variables.local.local).toBe("x");
    expect(out.logs[0]).toEqual({ level: "log", args: ["base is", "https://env", '{"env":"dev"}'] });
  });

  it("lets pre-request scripts edit the request", () => {
    const out = runScript(
      quickjs,
      baseInput(
        `
        pm.request.headers.add({ key: "X-Signature", value: btoa("hi") });
        pm.request.url.update(pm.request.url.toString() + "?page=2");
        pm.request.method = "post";
      `,
        { event: "prerequest", response: undefined },
      ),
    );
    expect(out.error).toBeNull();
    expect(out.request.method).toBe("POST");
    expect(out.request.url).toBe("https://api.dev/users?page=2");
    expect(out.request.headers).toContainEqual(["X-Signature", "aGk="]);
  });

  it("isolates the sandbox from host globals and records uncaught errors", () => {
    const out = runScript(quickjs, baseInput(`pm.environment.set("before", "1"); fetch("https://evil.example");`));
    expect(out.error).toMatch(/fetch/);
    expect(out.variables.environment.before).toBe("1");
    const req = runScript(quickjs, baseInput(`require("lodash")`));
    expect(req.error).toMatch(/belum didukung/);
  });

  it("stops infinite loops at the deadline", () => {
    const out = runScript(quickjs, baseInput(`while (true) {}`), { timeoutMs: 200 });
    expect(out.error).toMatch(/batas waktu|interrupted/i);
  });
});

describe("pipeline", () => {
  it("runs collection → request scripts around the send and resolves variables", async () => {
    const collection = newCollection("Shop");
    collection.scripts.preRequest = `pm.environment.set("ts", "123");`;
    collection.scripts.postResponse = `pm.test("collection-level", () => pm.response.to.be.ok);`;
    const request = newRequest({
      name: "Login",
      method: "POST",
      url: "{{base}}/login",
      headers: [newKeyValue("X-Ts", "{{ts}}")],
      body: { mode: "raw", language: "json", raw: '{"u":"{{user}}"}' },
      scripts: {
        preRequest: `pm.variables.set("user", "budi");`,
        postResponse: `pm.environment.set("token", pm.response.json().token); pm.test("has token", () => pm.expect(pm.response.json().token).to.be.a("string"));`,
      },
    });
    const scopes = emptyScopes();
    scopes.environment.base = "https://api.dev";

    let sent: unknown;
    const result = await executeRequest({
      quickjs,
      request,
      ancestors: [],
      collection,
      scopes,
      environmentName: "dev",
      send: async (resolved): Promise<ResponseData> => {
        sent = resolved;
        return { status: 200, statusText: "OK", headers: [], body: '{"token":"t-1"}', size: 15, timings: { total: 5 }, executor: "direct" };
      },
    });

    expect(sent).toMatchObject({
      method: "POST",
      url: "https://api.dev/login",
      body: { kind: "text", text: '{"u":"budi"}' },
    });
    expect((sent as { headers: [string, string][] }).headers).toContainEqual(["X-Ts", "123"]);
    expect(result.tests.map((t) => [t.name, t.passed])).toEqual([
      ["collection-level", true],
      ["has token", true],
    ]);
    expect(result.scopes.environment.token).toBe("t-1");
    expect(result.scopes.local).toEqual({ user: "budi" });
  });

  it("aborts when a pre-request script throws", async () => {
    const request = newRequest({ url: "https://api.dev", scripts: { preRequest: `throw new Error("boom")`, postResponse: "" } });
    let called = false;
    const result = await executeRequest({
      quickjs,
      request,
      ancestors: [],
      scopes: emptyScopes(),
      send: async () => {
        called = true;
        throw new Error("should not send");
      },
    });
    expect(called).toBe(false);
    expect(result.aborted).toBe(true);
    expect(result.logs.at(-1)?.args[0]).toContain("boom");
  });
});
