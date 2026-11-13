import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Privacy rule: Packetman's own network traffic must go through src/lib/egress.ts
    // so it is recorded in the Egress Monitor. User requests go through executors.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/app/api/**", "src/server/**"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "Gunakan egressFetch() dari @/lib/egress (atau executor) agar koneksi tercatat di Egress Monitor." },
        { name: "XMLHttpRequest", message: "Gunakan egressFetch() dari @/lib/egress." },
        { name: "WebSocket", message: "Koneksi keluar harus lewat @/lib/egress." },
        { name: "EventSource", message: "Koneksi keluar harus lewat @/lib/egress." },
      ],
      "no-restricted-properties": [
        "error",
        { object: "navigator", property: "sendBeacon", message: "Beacon/telemetri tidak diizinkan." },
        { object: "window", property: "fetch", message: "Gunakan egressFetch() dari @/lib/egress." },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
