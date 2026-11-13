// Bridge between the Packetman page (window.postMessage) and the extension service worker.
// Runs only on Packetman origins listed in manifest.json.

const VERSION = chrome.runtime.getManifest().version;

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const msg = event.data;
  if (!msg || msg.source !== "packetman-page") return;

  if (msg.type === "ping") {
    window.postMessage({ source: "packetman-ext", type: "pong", version: VERSION }, window.location.origin);
    return;
  }

  if (msg.type === "send" && typeof msg.id === "string") {
    chrome.runtime.sendMessage({ type: "send", request: msg.request, settings: msg.settings }, (reply) => {
      const error = chrome.runtime.lastError?.message || reply?.error;
      window.postMessage(
        { source: "packetman-ext", type: "response", id: msg.id, ...(error ? { error } : { response: reply.response }) },
        window.location.origin,
      );
    });
  }
});
