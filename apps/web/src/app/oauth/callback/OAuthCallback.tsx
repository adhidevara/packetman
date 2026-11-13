"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * OAuth 2.0 redirect target. Hands the authorization code (or error) back to
 * the Packetman window that started the login, on the same origin only.
 * The code never leaves the browser here; the token exchange happens in the opener.
 */

// Capture the query once at load: the effect below clears it from the address bar.
const captured = typeof window !== "undefined" ? window.location.search : "";
const subscribe = () => () => {};
let handled = false;

export function OAuthCallback() {
  const search = useSyncExternalStore(subscribe, () => captured, () => "");
  const params = new URLSearchParams(search);
  const state = params.get("state");
  const error = params.get("error");
  const errorDescription = params.get("error_description");

  useEffect(() => {
    const p = new URLSearchParams(captured);
    if (handled || !p.get("state")) return;
    handled = true; // StrictMode runs effects twice in dev
    const payload = {
      source: "packetman-oauth",
      state: p.get("state"),
      code: p.get("code"),
      error: p.get("error"),
      errorDescription: p.get("error_description"),
    };
    // Same-origin delivery only: the opener (popup flow) and/or a BroadcastChannel (new-tab flow).
    if (window.opener) window.opener.postMessage(payload, window.location.origin);
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel("packetman-oauth");
      channel.postMessage(payload);
      channel.close();
    }
    // Remove the code from the address bar and history, then close the window.
    window.history.replaceState(null, "", window.location.pathname);
    setTimeout(() => window.close(), 800);
  }, []);

  const message = !state
    ? "Halaman ini dipakai Packetman saat login OAuth. Kamu bisa menutupnya."
    : error
      ? `Login gagal: ${errorDescription ?? error}`
      : "Login berhasil. Kembali ke Packetman; jendela ini bisa ditutup.";

  return (
    <main className="flex h-full items-center justify-center gap-3 p-6 text-sm text-muted">
      <span className="seal" aria-hidden />
      <p>{message}</p>
    </main>
  );
}
