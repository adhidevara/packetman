"use client";

import { useEffect, useState } from "react";

let handled = false;

/**
 * OAuth 2.0 redirect target. Hands the authorization code (or error) back to
 * the Packetman window that opened this popup, on the same origin only.
 * The code never leaves the browser here; the token exchange happens in the opener.
 */
export function OAuthCallback() {
  const [message, setMessage] = useState("Memproses login…");

  useEffect(() => {
    // StrictMode runs effects twice in dev; the first run already consumed and cleared the URL.
    if (handled) return;
    handled = true;
    const params = new URLSearchParams(window.location.search);
    const payload = {
      source: "packetman-oauth",
      state: params.get("state"),
      code: params.get("code"),
      error: params.get("error"),
      errorDescription: params.get("error_description"),
    };
    if (!payload.state) {
      setMessage("Halaman ini dipakai Packetman saat login OAuth. Kamu bisa menutupnya.");
      return;
    }
    // Same-origin delivery only: the opener (popup flow) and/or a BroadcastChannel (new-tab flow).
    if (window.opener) window.opener.postMessage(payload, window.location.origin);
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel("packetman-oauth");
      channel.postMessage(payload);
      channel.close();
    }
    setMessage(payload.error ? `Login gagal: ${payload.errorDescription ?? payload.error}` : "Login berhasil. Kembali ke Packetman; jendela ini bisa ditutup.");
    // Remove the code from the address bar and history.
    window.history.replaceState(null, "", window.location.pathname);
    setTimeout(() => window.close(), 800);
  }, []);

  return (
    <main className="flex h-full items-center justify-center gap-3 p-6 text-sm text-muted">
      <span className="seal" aria-hidden />
      <p>{message}</p>
    </main>
  );
}
