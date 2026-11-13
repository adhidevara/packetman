import path from "node:path";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/*
 * Content Security Policy (static pages, so no nonces).
 * - script-src: 'unsafe-inline' is needed for Next.js inline bootstrap scripts without nonces;
 *   'wasm-unsafe-eval' lets the QuickJS script sandbox compile its WebAssembly.
 * - connect-src: user requests in "Direct" mode go straight from the browser to any API the
 *   user chooses, so it cannot be narrowed. Packetman's own traffic is policed in
 *   src/lib/egress.ts (and by ESLint), and shown in the Egress Monitor.
 * - Response previews render in a sandboxed srcdoc iframe that inherits this policy,
 *   so previewed HTML cannot load remote resources or run scripts.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src *",
  "worker-src 'self' blob:",
  "frame-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // No upgrade-insecure-requests: users legitimately test plain-http APIs.
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  // No COOP header: it could sever the OAuth popup's opener reference mid-login.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // Trace workspace packages (packages/*) from the monorepo root into the standalone build.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
