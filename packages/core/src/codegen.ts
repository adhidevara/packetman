import { serializeBody } from "./build";
import type { ResolvedRequest } from "./model";

export type CodegenLanguage = "curl" | "fetch" | "axios" | "python" | "go";

export const CODEGEN_LANGUAGES: { id: CodegenLanguage; label: string }[] = [
  { id: "curl", label: "cURL" },
  { id: "fetch", label: "JavaScript – fetch" },
  { id: "axios", label: "Node.js – axios" },
  { id: "python", label: "Python – requests" },
  { id: "go", label: "Go – net/http" },
];

const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
const js = (s: string) => JSON.stringify(s);
const py = (s: string) => JSON.stringify(s); // JSON string literals are valid Python literals for BMP text.
const goStr = (s: string) => JSON.stringify(s);

function curl(r: ResolvedRequest): string {
  const lines = [`curl --location --request ${r.method} ${shq(r.url)}`];
  for (const [k, v] of r.headers) lines.push(`--header ${shq(`${k}: ${v}`)}`);
  if (r.body.kind === "formdata") for (const [k, v] of r.body.fields) lines.push(`--form ${shq(`${k}=${v}`)}`);
  else if (r.body.kind === "urlencoded") for (const [k, v] of r.body.fields) lines.push(`--data-urlencode ${shq(`${k}=${v}`)}`);
  else if (r.body.kind === "text") lines.push(`--data-raw ${shq(r.body.text)}`);
  return lines.join(" \\\n  ");
}

function fetchCode(r: ResolvedRequest): string {
  const out: string[] = [];
  const hasHeaders = r.headers.length > 0;
  if (hasHeaders) {
    out.push("const headers = new Headers();");
    for (const [k, v] of r.headers) out.push(`headers.append(${js(k)}, ${js(v)});`);
    out.push("");
  }
  let bodyRef = "";
  if (r.body.kind === "formdata") {
    out.push("const body = new FormData();");
    for (const [k, v] of r.body.fields) out.push(`body.append(${js(k)}, ${js(v)});`);
    out.push("");
    bodyRef = "body";
  } else if (r.body.kind === "urlencoded") {
    out.push("const body = new URLSearchParams();");
    for (const [k, v] of r.body.fields) out.push(`body.append(${js(k)}, ${js(v)});`);
    out.push("");
    bodyRef = "body";
  } else if (r.body.kind === "text") {
    out.push(`const body = ${js(r.body.text)};`, "");
    bodyRef = "body";
  }
  const opts = [`  method: ${js(r.method)},`];
  if (hasHeaders) opts.push("  headers,");
  if (bodyRef) opts.push("  body,");
  opts.push(`  redirect: "follow",`);
  out.push(`const response = await fetch(${js(r.url)}, {`, ...opts, "});", "console.log(response.status, await response.text());");
  return out.join("\n");
}

function axiosCode(r: ResolvedRequest): string {
  const out = [`const axios = require("axios");`];
  let data: string | undefined;
  if (r.body.kind === "formdata") {
    out.push(`const FormData = require("form-data");`, "const data = new FormData();");
    for (const [k, v] of r.body.fields) out.push(`data.append(${js(k)}, ${js(v)});`);
    data = "data";
  } else if (r.body.kind === "urlencoded") {
    out.push("const data = new URLSearchParams();");
    for (const [k, v] of r.body.fields) out.push(`data.append(${js(k)}, ${js(v)});`);
    data = "data";
  } else if (r.body.kind === "text") {
    out.push(`const data = ${js(r.body.text)};`);
    data = "data";
  }
  out.push("", "const config = {", `  method: ${js(r.method.toLowerCase())},`, `  url: ${js(r.url)},`);
  if (r.headers.length || r.body.kind === "formdata") {
    out.push("  headers: {");
    for (const [k, v] of r.headers) out.push(`    ${js(k)}: ${js(v)},`);
    if (r.body.kind === "formdata") out.push("    ...data.getHeaders(),");
    out.push("  },");
  }
  if (data) out.push(`  data: ${data},`);
  out.push("};", "", "axios.request(config)", "  .then((res) => console.log(res.status, res.data))", "  .catch((err) => console.error(err));");
  return out.join("\n");
}

function pythonCode(r: ResolvedRequest): string {
  const out = ["import requests", "", `url = ${py(r.url)}`];
  const headers = r.headers.filter(([k]) => !(r.body.kind === "formdata" && k.toLowerCase() === "content-type"));
  out.push("headers = {" + headers.map(([k, v]) => `\n    ${py(k)}: ${py(v)},`).join("") + (headers.length ? "\n}" : "}"));
  let extra = "";
  if (r.body.kind === "formdata" || r.body.kind === "urlencoded") {
    out.push("payload = {" + r.body.fields.map(([k, v]) => `\n    ${py(k)}: ${py(v)},`).join("") + (r.body.fields.length ? "\n}" : "}"));
    extra = r.body.kind === "formdata" ? ", files={k: (None, v) for k, v in payload.items()}" : ", data=payload";
  } else if (r.body.kind === "text") {
    out.push(`payload = ${py(r.body.text)}`);
    extra = ", data=payload.encode(\"utf-8\")";
  }
  out.push("", `response = requests.request(${py(r.method)}, url, headers=headers${extra})`, "print(response.status_code, response.text)");
  return out.join("\n");
}

function goCode(r: ResolvedRequest): string {
  const imports = new Set(["fmt", "io", "net/http"]);
  const pre: string[] = [];
  let bodyExpr = "nil";
  if (r.body.kind === "text") {
    imports.add("strings");
    bodyExpr = `strings.NewReader(${goStr(r.body.text)})`;
  } else if (r.body.kind === "urlencoded") {
    imports.add("strings");
    bodyExpr = `strings.NewReader(${goStr(serializeBody(r.body) ?? "")})`;
  } else if (r.body.kind === "formdata") {
    imports.add("bytes");
    imports.add("mime/multipart");
    pre.push("\tpayload := &bytes.Buffer{}", "\twriter := multipart.NewWriter(payload)");
    for (const [k, v] of r.body.fields) pre.push(`\t_ = writer.WriteField(${goStr(k)}, ${goStr(v)})`);
    pre.push("\t_ = writer.Close()");
    bodyExpr = "payload";
  }
  const lines = [
    "package main",
    "",
    "import (",
    ...[...imports].sort().map((i) => `\t"${i}"`),
    ")",
    "",
    "func main() {",
    ...pre,
    `\treq, err := http.NewRequest(${goStr(r.method)}, ${goStr(r.url)}, ${bodyExpr})`,
    "\tif err != nil {",
    "\t\tpanic(err)",
    "\t}",
    ...r.headers.map(([k, v]) => `\treq.Header.Add(${goStr(k)}, ${goStr(v)})`),
    ...(r.body.kind === "formdata" ? ["\treq.Header.Set(\"Content-Type\", writer.FormDataContentType())"] : []),
    "",
    "\tres, err := http.DefaultClient.Do(req)",
    "\tif err != nil {",
    "\t\tpanic(err)",
    "\t}",
    "\tdefer res.Body.Close()",
    "\tbody, _ := io.ReadAll(res.Body)",
    "\tfmt.Println(res.StatusCode, string(body))",
    "}",
  ];
  return lines.join("\n");
}

export function generateCode(language: CodegenLanguage, request: ResolvedRequest): string {
  switch (language) {
    case "curl":
      return curl(request);
    case "fetch":
      return fetchCode(request);
    case "axios":
      return axiosCode(request);
    case "python":
      return pythonCode(request);
    case "go":
      return goCode(request);
  }
}
