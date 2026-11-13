"use client";

export const OAUTH_POPUP_FEATURES = "width=520,height=720,menubar=no,toolbar=no";
export const OAUTH_CHANNEL = "packetman-oauth";

export function oauthRedirectUri(): string {
  return `${window.location.origin}/oauth/callback`;
}

/**
 * Wait for the callback page to hand back the authorization code for `state`.
 *
 * The code arrives over two same-origin channels: `postMessage` from a popup
 * we opened, or a BroadcastChannel when popups are blocked and the user opened
 * the login link in a normal tab. Both are restricted to this origin.
 */
export function waitForAuthorizationCode(popup: Window | null, authorizeUrl: string, state: string, timeoutMs = 5 * 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let done = false;
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(OAUTH_CHANNEL) : null;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onWindowMessage);
      channel?.close();
      clearInterval(poll);
      clearTimeout(timer);
      fn();
    };
    const handle = (data: { source?: string; state?: string; code?: string; error?: string; errorDescription?: string } | undefined) => {
      if (data?.source !== OAUTH_CHANNEL) return;
      if (data.state !== state) return; // a different login attempt; ignore
      if (data.error) return finish(() => reject(new Error(`Login ditolak: ${data.errorDescription ?? data.error}`)));
      if (!data.code) return finish(() => reject(new Error("Provider tidak mengirim authorization code.")));
      finish(() => resolve(String(data.code)));
    };
    const onWindowMessage = (ev: MessageEvent) => {
      if (ev.origin === window.location.origin) handle(ev.data);
    };
    window.addEventListener("message", onWindowMessage);
    if (channel) channel.onmessage = (ev) => handle(ev.data);
    const poll = setInterval(() => {
      if (popup?.closed) finish(() => reject(new Error("Jendela login ditutup sebelum selesai.")));
    }, 500);
    const timer = setTimeout(() => finish(() => reject(new Error("Login OAuth melewati batas waktu 5 menit."))), timeoutMs);
    if (popup) {
      try {
        popup.location.href = authorizeUrl;
      } catch (e) {
        finish(() => reject(e instanceof Error ? e : new Error(String(e))));
      }
    }
  });
}
