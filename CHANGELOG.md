# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/), versi mengikuti [SemVer](https://semver.org/lang/id/).

## [0.1.0] - 2026-11-14

Rilis pertama Packetman: API client berbasis web yang mengutamakan privasi.

### Ditambahkan

- **Request builder HTTP**: method, URL dengan highlight `{{variabel}}`, params yang sinkron dua arah dengan URL, headers, body (raw JSON/XML/Text/HTML/JS, x-www-form-urlencoded, form-data teks), pengaturan redirect dan timeout. Perintah cURL bisa ditempel langsung di URL bar.
- **Auth**: Inherit, None, API Key (header/query), Bearer, Basic, dan **OAuth 2.0** (Authorization Code + PKCE, Client Credentials, refresh token). Ada callback `/oauth/callback`, dan kalau pop-up diblokir tersedia jalur tab biasa lewat BroadcastChannel.
- **Variabel** lima scope (local > data > environment > collection > global), nilai awal vs nilai saat ini (lokal saja), tipe `secret`, ±20 variabel dinamis.
- **Script** pre-request & post-response di sandbox QuickJS (tanpa jaringan/DOM/storage, batas 10 detik & 64 MB) dengan API `pm.*` yang kompatibel Postman, plus global legacy.
- **Collection Runner**: pilih request, jumlah iterasi, jeda, file data CSV/JSON, berhenti saat error, `setNextRequest`, hasil live, ekspor JSON dan JUnit XML.
- **Koleksi, folder, tab, riwayat, environment, globals**, semuanya tersimpan di IndexedDB browser (local-first, tanpa akun).
- **Impor** Postman Collection v2.0/v2.1, Postman Environment, cURL. **Ekspor** Postman v2.1. Nilai secret dan token OAuth tidak pernah ikut ekspor.
- **Secret scanner lokal** (Stripe, Midtrans, Xendit, AWS, GitHub, Slack, Google, OpenAI, Anthropic, JWT, private key) dengan tawaran mengubah variabel jadi secret saat impor.
- **Generate kode**: cURL, JavaScript fetch, Node axios, Python requests, Go.
- **Executor berlapis**: extension → browser langsung → relay cloud (hanya dengan izin per domain).
- **Relay** dengan proteksi SSRF (blokir alamat privat/loopback/link-local/metadata cloud, cek ulang IP saat connect, cek ulang tiap redirect, batasi port dan ukuran, rate limit, tanpa log payload).
- **Egress Monitor** dan status "Tersegel" di status bar. ESLint melarang koneksi keluar langsung di luar modul egress.
- **Packetman Interceptor** (Chrome MV3) untuk mengirim request tanpa batas CORS dan tanpa server.
- **Self-host**: Dockerfile (Next.js standalone, user non-root, healthcheck `/api/health`) dan `docker-compose.yml`.
- **Keamanan**: Content Security Policy, header keamanan, telemetri Next.js/Turborepo dimatikan.
- **Lisensi**: Apache License 2.0.
