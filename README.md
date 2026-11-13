# Packetman

API client berbasis web yang mengutamakan privasi. Kelasnya sama dengan Postman, tapi data request, token, dan payload kamu tetap di perangkatmu: tidak ada koneksi latar belakang, tidak ada plugin yang terpasang sendiri, dan tidak ada AI yang membaca datamu.

- Apa yang keluar dari perangkatmu: [PRIVACY.md](PRIVACY.md) (juga tersedia di app, `/privacy`)
- Perubahan per versi: [CHANGELOG.md](CHANGELOG.md)
- Melaporkan celah keamanan: [SECURITY.md](SECURITY.md)
- Spesifikasi produk & roadmap: [docs/PACKETMAN_SPEC.md](docs/PACKETMAN_SPEC.md)

## Self-host dengan Docker

```bash
docker compose up -d --build
```

Buka http://localhost:3000. Healthcheck tersedia di `/api/health`. Konfigurasi relay ada di `docker-compose.yml` (lihat juga [apps/web/.env.example](apps/web/.env.example)). Pasang di belakang HTTPS untuk deployment publik.

## Development

Butuh Node.js 20+ dan pnpm 11.

```bash
pnpm install
```

```bash
pnpm dev
```

Buka http://localhost:3000. Workspace demo (koleksi + environment) dibuat otomatis saat pertama dibuka, dan semuanya tersimpan di IndexedDB browser.

```bash
pnpm lint
```

```bash
pnpm typecheck
```

```bash
pnpm test
```

```bash
pnpm build
```

Telemetri Next.js dan Turborepo dimatikan lewat script (`NEXT_TELEMETRY_DISABLED`, `TURBO_TELEMETRY_DISABLED`, `DO_NOT_TRACK`).

## Struktur

```
apps/
  web/          Next.js 16: workbench UI, IndexedDB, executor, relay (/api/relay),
                OAuth callback (/oauth/callback), halaman privasi (/privacy), healthcheck
  extension/    Packetman Interceptor (Chrome MV3): kirim request tanpa batas CORS, tanpa server
packages/
  core/         Model koleksi, variabel & scope, request builder, OAuth 2.0 (PKCE),
                importer Postman/cURL, file data CSV/JSON, codegen, secret scanner
  runtime/      Sandbox script QuickJS + API pm.* kompatibel Postman, pipeline eksekusi,
                Collection Runner, laporan JUnit
docs/           Spesifikasi produk & teknis
.github/        CI (lint, typecheck, test, build, Docker, paket extension) dan workflow rilis
```

## Fitur v0.1.0

- **Request builder HTTP**: method, URL dengan highlight `{{variabel}}`, params sinkron dua arah dengan URL, headers, body (raw JSON/XML/Text/HTML/JS, urlencoded, form-data teks), pengaturan redirect & timeout. Perintah cURL bisa ditempel langsung di URL bar.
- **Auth**: Inherit, None, API Key (header/query), Bearer, Basic, OAuth 2.0 (Authorization Code + PKCE, Client Credentials, refresh token). Auth koleksi/folder diwarisi.
- **Variabel** lima scope (local > data > environment > collection > global), nilai awal vs nilai saat ini (lokal saja), tipe `secret`, ±20 variabel dinamis (`{{$guid}}`, `{{$randomEmail}}`, …).
- **Script** pre-request & post-response (koleksi → folder → request) di sandbox QuickJS (tanpa jaringan/DOM, batas 10 detik, memori 64 MB). API `pm.*`: variables/environment/collectionVariables/globals, `pm.test`, `pm.expect` (subset chai), `pm.response.to.have.status/header/jsonBody`, `pm.request` yang bisa diubah, `pm.execution.setNextRequest`, `console.*`, plus global legacy (`tests[]`, `responseBody`, `postman.setEnvironmentVariable`).
- **Collection Runner**: jalankan koleksi/folder, pilih request, iterasi, jeda, file data CSV/JSON, berhenti saat error, ekspor JSON & JUnit XML.
- **Response viewer**: pretty/raw/preview, headers, hasil test, log script, request yang benar-benar terkirim, salin & unduh.
- **Koleksi, folder, tab, riwayat, environment, globals**, semua di IndexedDB.
- **Impor** Postman Collection v2.0/v2.1, Postman Environment, cURL. **Ekspor** Postman v2.1 (nilai secret & token OAuth tidak ikut).
- **Secret scanner lokal** (Stripe, Midtrans, Xendit, AWS, GitHub, Slack, Google, OpenAI, Anthropic, JWT, private key).
- **Generate kode**: cURL, JavaScript fetch, Node axios, Python requests, Go. Default tanpa mengisi nilai variabel.
- **Executor berlapis**: extension → browser langsung → relay (hanya dengan izin per domain).
- **Relay** dengan proteksi SSRF dan tanpa log payload.
- **Egress Monitor** + ESLint yang melarang koneksi keluar di luar `src/lib/egress.ts`.
- **Keamanan**: Content Security Policy, header keamanan, image Docker non-root.
- Tema gelap & terang. Shortcut: Ctrl+Enter kirim, Ctrl+S simpan, Ctrl+O impor, Ctrl+Alt+T tab baru, Ctrl+` console.

## OAuth 2.0

Daftarkan callback URL berikut di provider OAuth-mu (ditampilkan juga di tab Auth):

```
https://<domain-packetman-kamu>/oauth/callback
```

Kalau browser memblokir pop-up, Packetman menampilkan link login untuk dibuka di tab baru. Hasilnya dikembalikan lewat BroadcastChannel di origin yang sama.

## Packetman Interceptor (extension)

1. Buka `chrome://extensions`, aktifkan Developer mode.
2. Klik **Load unpacked**, pilih folder `apps/extension`.
3. Reload Packetman. Status bar akan menampilkan "Extension aktif".

Extension hanya menerima pesan dari origin yang terdaftar di [`apps/extension/manifest.json`](apps/extension/manifest.json) (`localhost:3000`, `127.0.0.1:3000`, dan `app.packetman.dev` sebagai placeholder). Ganti domain produksi sebelum rilis ke Chrome Web Store.

## Rilis

1. Pastikan CI hijau.
2. Perbarui versi di `package.json`, `apps/web/src/lib/version.ts`, `apps/extension/manifest.json`, dan `CHANGELOG.md`.
3. Buat dan push tag `vX.Y.Z`. Workflow [release.yml](.github/workflows/release.yml) membangun image ke GHCR dan melampirkan zip extension di GitHub Release.

## Lisensi

Packetman dirilis di bawah [Apache License 2.0](LICENSE). Packetman adalah proyek independen dan tidak berafiliasi dengan Postman, Inc.

## Belum ada (lihat roadmap di spesifikasi)

GraphQL/WebSocket/gRPC, upload file, Digest/AWS v4/OAuth1, Desktop Agent, sync tim E2E, mock server, monitor, CLI, Packetbot (AI), `pm.sendRequest`, `require()` library di sandbox.
