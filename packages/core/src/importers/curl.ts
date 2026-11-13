import { newKeyValue, newRequest, type KeyValue, type RawLanguage, type RequestNode } from "../model";
import { paramsFromUrl } from "../url";

/** Split a shell command line into argv, handling quotes, escapes and line continuations (bash and cmd). */
export function tokenizeShell(input: string): string[] {
  const src = input.replace(/\\\r?\n/g, " ").replace(/\^\r?\n/g, " ").replace(/`\r?\n/g, " ");
  const out: string[] = [];
  let cur = "";
  let has = false;
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      if (has) {
        out.push(cur);
        cur = "";
        has = false;
      }
      i++;
      continue;
    }
    has = true;
    if (c === "'") {
      const end = src.indexOf("'", i + 1);
      cur += src.slice(i + 1, end < 0 ? undefined : end);
      i = end < 0 ? src.length : end + 1;
    } else if (c === "$" && src[i + 1] === "'") {
      i += 2;
      while (i < src.length && src[i] !== "'") {
        if (src[i] === "\\" && i + 1 < src.length) {
          const n = src[i + 1]!;
          cur += n === "n" ? "\n" : n === "t" ? "\t" : n === "r" ? "\r" : n;
          i += 2;
        } else cur += src[i++];
      }
      i++;
    } else if (c === '"') {
      i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === "\\" && i + 1 < src.length && '"\\$`'.includes(src[i + 1]!)) {
          cur += src[i + 1];
          i += 2;
        } else cur += src[i++];
      }
      i++;
    } else if (c === "\\" && i + 1 < src.length) {
      cur += src[i + 1];
      i += 2;
    } else {
      cur += c;
      i++;
    }
  }
  if (has) out.push(cur);
  return out;
}

export function looksLikeCurl(text: string): boolean {
  return /^\s*curl(\.exe)?\s/i.test(text);
}

function guessLanguage(contentType: string | undefined, body: string): RawLanguage {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("json")) return "json";
  if (ct.includes("xml")) return "xml";
  if (ct.includes("html")) return "html";
  const t = body.trim();
  if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) return "json";
  if (t.startsWith("<")) return "xml";
  return "text";
}

const IGNORED_FLAGS_WITH_VALUE = new Set(["--connect-timeout", "-m", "--max-time", "-o", "--output", "--retry", "-w", "--write-out", "--cacert", "--cert", "--key", "-x", "--proxy", "--resolve"]);

/** Parse a cURL command into a Packetman request. Throws on input that is not a curl command. */
export function importCurl(command: string): RequestNode {
  const argv = tokenizeShell(command.trim());
  if (!argv.length || !/^curl(\.exe)?$/i.test(argv[0]!)) throw new Error("Perintah harus diawali dengan `curl`.");

  let method: string | undefined;
  let url = "";
  const headers: KeyValue[] = [];
  const dataParts: string[] = [];
  const urlencodedParts: [string, string][] = [];
  const formParts: KeyValue[] = [];
  let user: string | undefined;
  let forceGet = false;

  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]!;
    const next = () => argv[++i] ?? "";
    const longEq = a.startsWith("--") && a.includes("=") ? [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)] : null;
    const flag = longEq ? longEq[0]! : a;
    const val = () => (longEq ? longEq[1]! : next());

    switch (flag) {
      case "-X":
      case "--request":
        method = val().toUpperCase();
        break;
      case "-H":
      case "--header": {
        const h = val();
        const idx = h.indexOf(":");
        if (idx > 0) headers.push(newKeyValue(h.slice(0, idx).trim(), h.slice(idx + 1).trim()));
        break;
      }
      case "-d":
      case "--data":
      case "--data-raw":
      case "--data-binary":
      case "--data-ascii":
        dataParts.push(val());
        break;
      case "--data-urlencode": {
        const v = val();
        const eq = v.indexOf("=");
        if (eq > 0) urlencodedParts.push([v.slice(0, eq), v.slice(eq + 1)]);
        else urlencodedParts.push(["", v]);
        break;
      }
      case "--json":
        dataParts.push(val());
        headers.push(newKeyValue("Content-Type", "application/json"));
        headers.push(newKeyValue("Accept", "application/json"));
        break;
      case "-F":
      case "--form": {
        const v = val();
        const eq = v.indexOf("=");
        if (eq > 0) formParts.push(newKeyValue(v.slice(0, eq), v.slice(eq + 1)));
        break;
      }
      case "-u":
      case "--user":
        user = val();
        break;
      case "-A":
      case "--user-agent":
        headers.push(newKeyValue("User-Agent", val()));
        break;
      case "-b":
      case "--cookie":
        headers.push(newKeyValue("Cookie", val()));
        break;
      case "-e":
      case "--referer":
        headers.push(newKeyValue("Referer", val()));
        break;
      case "--url":
        url = val();
        break;
      case "-G":
      case "--get":
        forceGet = true;
        break;
      case "-I":
      case "--head":
        method = "HEAD";
        break;
      default:
        if (IGNORED_FLAGS_WITH_VALUE.has(flag)) {
          if (!longEq) i++;
        } else if (!a.startsWith("-") && !url) {
          url = a;
        }
    }
  }

  if (!url) throw new Error("URL tidak ditemukan di perintah cURL.");

  const contentType = headers.find((h) => h.key.toLowerCase() === "content-type")?.value;
  const req = newRequest({ name: url.replace(/^https?:\/\//, "").split("?")[0]!.slice(0, 60) || "cURL import", url });

  if (forceGet && (dataParts.length || urlencodedParts.length)) {
    const qs = [...dataParts, ...urlencodedParts.map(([k, v]) => (k ? `${k}=${encodeURIComponent(v)}` : encodeURIComponent(v)))].join("&");
    req.url = url + (url.includes("?") ? "&" : "?") + qs;
    req.method = "GET";
  } else if (formParts.length) {
    req.body = { mode: "formdata", fields: formParts.map((f) => ({ ...f, kind: "text" as const })) };
    req.method = method ?? "POST";
  } else if (urlencodedParts.length || (dataParts.length && (contentType ?? "").includes("x-www-form-urlencoded"))) {
    const fields: KeyValue[] = urlencodedParts.map(([k, v]) => newKeyValue(k, v));
    for (const part of dataParts) {
      for (const pair of part.split("&")) {
        const eq = pair.indexOf("=");
        fields.push(newKeyValue(decodeURIComponent(eq >= 0 ? pair.slice(0, eq) : pair), decodeURIComponent(eq >= 0 ? pair.slice(eq + 1) : "")));
      }
    }
    req.body = { mode: "urlencoded", fields };
    req.method = method ?? "POST";
    const i = headers.findIndex((h) => h.key.toLowerCase() === "content-type");
    if (i >= 0) headers.splice(i, 1);
  } else if (dataParts.length) {
    const raw = dataParts.join("&");
    req.body = { mode: "raw", language: guessLanguage(contentType, raw), raw };
    req.method = method ?? "POST";
  } else {
    req.method = method ?? "GET";
  }

  if (user !== undefined) {
    const idx = user.indexOf(":");
    req.auth = { type: "basic", username: idx >= 0 ? user.slice(0, idx) : user, password: idx >= 0 ? user.slice(idx + 1) : "" };
  } else {
    const authIdx = headers.findIndex((h) => h.key.toLowerCase() === "authorization" && /^bearer\s+/i.test(h.value));
    if (authIdx >= 0) {
      req.auth = { type: "bearer", token: headers[authIdx]!.value.replace(/^bearer\s+/i, "") };
      headers.splice(authIdx, 1);
    } else {
      req.auth = { type: "none" };
    }
  }

  req.headers = headers;
  req.params = paramsFromUrl(req.url);
  return req;
}
