// Packetman Interceptor service worker.
// Executes requests on behalf of the Packetman page with the extension's host
// permissions, which are not subject to the page's CORS policy. Nothing is
// logged or sent anywhere except the request's own target.

const ALLOWED_ORIGINS = new Set(["http://localhost:3000", "http://127.0.0.1:3000", "https://app.packetman.dev"]);

function encodeBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  switch (req.body?.kind) {
    case "text":
      return req.body.text;
    case "urlencoded":
      return new URLSearchParams(req.body.fields).toString();
    case "formdata": {
      const fd = new FormData();
      for (const [k, v] of req.body.fields) fd.append(k, v);
      return fd;
    }
    default:
      return undefined;
  }
}

async function execute(req, settings) {
  const headers = new Headers();
  const notes = [];
  for (const [k, v] of req.headers || []) {
    if (req.body?.kind === "formdata" && k.toLowerCase() === "content-type") continue;
    try {
      headers.append(k, v);
    } catch {
      notes.push(`Header "${k}" ditolak oleh browser.`);
    }
  }
  const started = performance.now();
  const res = await fetch(req.url, {
    method: req.method,
    headers,
    body: encodeBody(req),
    redirect: settings?.followRedirects === false ? "manual" : "follow",
    credentials: "omit",
    cache: "no-store",
    signal: AbortSignal.timeout(settings?.timeoutMs || 30000),
  });
  const body = req.method === "HEAD" ? "" : await res.text();
  return {
    status: res.status,
    statusText: res.statusText,
    headers: [...res.headers.entries()],
    body,
    size: new TextEncoder().encode(body).length,
    timings: { total: Math.round(performance.now() - started) },
    url: res.url || req.url,
    executor: "extension",
    notes: [...notes, "Dikirim dari browsermu lewat Packetman Interceptor. Tidak melewati server mana pun."],
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const origin = sender.origin || (sender.url ? new URL(sender.url).origin : "");
  if (sender.id !== chrome.runtime.id || !ALLOWED_ORIGINS.has(origin)) {
    sendResponse({ error: "Origin tidak diizinkan." });
    return false;
  }
  if (message?.type !== "send") return false;
  execute(message.request, message.settings)
    .then((response) => sendResponse({ response }))
    .catch((err) => sendResponse({ error: err?.name === "TimeoutError" ? "Timeout." : `Gagal: ${err?.message || err}` }));
  return true; // keep the channel open for the async reply
});
