import { newCollection, newEnvironment, newFolder, newKeyValue, newRequest, newVariable, type Collection, type Environment } from "@packetman/core";

/** First-run demo data. Uses public, CORS-friendly test APIs so Direct mode works out of the box. */
export function demoCollection(): Collection {
  const c = newCollection("Packetman Demo");
  c.description = "Contoh request untuk mencoba Packetman. Semua tersimpan di browser ini saja.";
  c.variables = [newVariable("jsonApi", "https://jsonplaceholder.typicode.com")];

  const basics = newFolder("Dasar");
  basics.items = [
    newRequest({
      name: "Echo GET dengan query",
      url: "{{baseUrl}}/get?hello=packetman&page=1",
      params: [newKeyValue("hello", "packetman"), newKeyValue("page", "1")],
      scripts: {
        preRequest: "",
        postResponse: [
          'pm.test("Status 200", () => pm.response.to.have.status(200));',
          'pm.test("Query terkirim", () => {',
          "  const json = pm.response.json();",
          '  pm.expect(json.args).to.have.property("hello", "packetman");',
          "});",
        ].join("\n"),
      },
    }),
    newRequest({
      name: "POST JSON + variabel dinamis",
      method: "POST",
      url: "{{baseUrl}}/post",
      headers: [newKeyValue("X-Request-Id", "{{$guid}}")],
      body: { mode: "raw", language: "json", raw: '{\n  "name": "{{$randomFullName}}",\n  "email": "{{$randomEmail}}",\n  "createdAt": "{{$isoTimestamp}}"\n}' },
      scripts: {
        preRequest: 'pm.variables.set("startedAt", Date.now());\nconsole.log("Mengirim ke", pm.request.url.toString());',
        postResponse: [
          "const json = pm.response.json();",
          'pm.test("Body JSON diterima server", () => pm.expect(json.json).to.have.property("email"));',
          'pm.environment.set("lastUserName", json.json.name);',
        ].join("\n"),
      },
    }),
    newRequest({
      name: "Bearer token dari environment",
      url: "{{baseUrl}}/bearer",
      auth: { type: "bearer", token: "{{token}}" },
      scripts: { preRequest: "", postResponse: 'pm.test("Token diterima", () => pm.expect(pm.response.json().authenticated).to.be.true);' },
    }),
  ];

  const users = newFolder("Users (JSONPlaceholder)");
  users.items = [
    newRequest({
      name: "List users",
      url: "{{jsonApi}}/users",
      scripts: {
        preRequest: "",
        postResponse: [
          'pm.test("Ada 10 user", () => pm.expect(pm.response.json()).to.have.lengthOf(10));',
          'pm.collectionVariables.set("firstUserId", pm.response.json()[0].id);',
        ].join("\n"),
      },
    }),
    newRequest({ name: "Get user pertama", url: "{{jsonApi}}/users/{{firstUserId}}" }),
  ];

  c.items = [basics, users];
  return c;
}

export function demoEnvironment(): Environment {
  const e = newEnvironment("Demo");
  e.values = [newVariable("baseUrl", "https://httpbin.org"), newVariable("token", "demo-token-123", "secret")];
  return e;
}
