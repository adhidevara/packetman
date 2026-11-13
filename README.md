# Packetman

API client berbasis web yang mengutamakan privasi. Kelasnya sama dengan Postman, tapi data request, token, dan payload kamu tetap di perangkatmu: tidak ada koneksi latar belakang, tidak ada plugin yang terpasang sendiri, dan AI mati secara default.

Spesifikasi lengkap ada di [docs/PACKETMAN_SPEC.md](docs/PACKETMAN_SPEC.md).

## Menjalankan

Butuh Node.js 20+ dan pnpm 11.

```bash
pnpm install
```

```bash
pnpm dev
```

Buka http://localhost:3000. Workspace demo (koleksi + environment) dibuat otomatis saat pertama kali dibuka, dan semuanya tersimpan di IndexedDB browser.

```bash
pnpm test
```

```bash
pnpm typecheck
```

Telemetri Next.js dan Turborepo dimatikan lewat script (`NEXT_TELEMETRY_DISABLED`, `TURBO_TELEMETRY_DISABLED`).

## Struktur

```
apps/
  web/          Next.js 16 app: workbench UI, IndexedDB, executor, relay (/api/relay)
  extension/    Packetman Interceptor (Chrome MV3): kirim request tanpa batas CORS, tanpa server
packages/
  core/         Model koleksi, variabel & scope, request builder, importer Postman/cURL,
                codegen (cURL, fetch, axios, Python, Go), secret scanner
  runtime/      Sandbox script QuickJS + API pm.* yang kompatibel Postman, pipeline eksekusi
docs/           Spesifikasi produk & teknis
```

## Yang sudah jalan (MVP Fase 1)

- Request builder HTTP: method, URL dengan highlight `{{variabel}}`, params (sinkron dua arah dengan URL), headers, body (raw JSON/XML/Text/HTML/JS, urlencoded, form-data teks), pengaturan redirect & timeout. Tempel perintah cURL langsung di URL bar.
- Auth: Inherit, None, API Key (header/query), Bearer, Basic. Auth koleksi/folder diwarisi.
- Variabel lima scope (local > data > environment > collection > global), nilai awal vs nilai saat ini (lokal saja), tipe `secret`, ±20 variabel dinamis (`{{$guid}}`, `{{$randomEmail}}`, …).
- Script pre-request & post-response (koleksi → folder → request) di sandbox QuickJS (tanpa jaringan/DOM, batas waktu 10 s, memori 64 MB). API `pm.*`: variables/environment/collectionVariables/globals, `pm.test`, `pm.expect` (subset chai), `pm.response.to.have.status/header/jsonBody`, `pm.request` yang bisa diubah, `console.*`, plus global legacy (`tests[]`, `responseBody`, `postman.setEnvironmentVariable`).
- Response viewer: pretty/raw/preview, headers, hasil test, log script, request yang benar-benar terkirim, salin & unduh.
- Koleksi, folder, tab, riwayat, environment, globals. Semua di IndexedDB.
- Impor Postman Collection v2.0/v2.1, Postman Environment, cURL. Ekspor Postman v2.1 (nilai secret tidak ikut).
- Secret scanner lokal (Stripe, Midtrans, Xendit, AWS, GitHub, Slack, Google, OpenAI, Anthropic, JWT, private key). Saat impor, ada tawaran mengubah variabel jadi secret.
- Generate kode: cURL, JavaScript fetch, Node axios, Python requests, Go. Default tanpa mengisi nilai variabel.
- Executor berlapis: Extension → browser langsung. Relay cloud hanya dipakai dengan izin per domain.
- Relay dengan proteksi SSRF: blokir loopback/privat/link-local/metadata cloud, cek ulang IP saat connect (anti DNS rebinding), cek ulang tiap redirect, batasi port, ukuran 10 MB, rate limit, tanpa log payload.
- Egress Monitor: setiap koneksi milik Packetman sendiri tercatat. ESLint melarang `fetch`/`WebSocket`/`sendBeacon` langsung di luar `src/lib/egress.ts` dan executor.
- Tema gelap & terang. Shortcut: Ctrl+Enter kirim, Ctrl+S simpan, Ctrl+O impor, Ctrl+Alt+T tab baru, Ctrl+` console.

## Packetman Interceptor (extension)

1. Buka `chrome://extensions`, aktifkan Developer mode.
2. Klik **Load unpacked**, pilih folder `apps/extension`.
3. Reload Packetman. Status bar akan menampilkan "Extension aktif".

Extension hanya menerima pesan dari origin Packetman yang terdaftar di `manifest.json` (`localhost:3000`, `127.0.0.1:3000`, dan domain produksi `app.packetman.dev` sebagai placeholder). Ganti domain itu sebelum rilis.

## Konfigurasi relay

Lihat [apps/web/.env.example](apps/web/.env.example). Jangan aktifkan `PACKETMAN_RELAY_ALLOW_PRIVATE` di deployment publik.

## Belum ada (lihat roadmap di spesifikasi)

Collection Runner & data file, OAuth 2.0/Digest/AWS v4, GraphQL/WebSocket/gRPC, upload file, Desktop Agent, sync tim E2E, mock server, monitor, CLI, Packetbot (AI), `pm.sendRequest`, `require()` library di sandbox.
