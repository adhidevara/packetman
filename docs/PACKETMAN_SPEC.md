# Packetman — Spesifikasi Produk & Teknis

> **API client berbasis web yang mengutamakan privasi.** Kelasnya sama dengan Postman, tapi data request, token, dan payload kamu tetap milik kamu. Tidak ada koneksi latar belakang diam-diam, tidak ada plugin yang terpasang sendiri, dan AI hanya aktif kalau kamu nyalakan. Dibangun dari nol: web-first, local-first, Git-native, open-source, dan bisa di-self-host.

| | |
|---|---|
| Versi dokumen | 0.2 (repositioning privacy-first) |
| Tanggal | 13 November 2026 |
| Basis riset | Reverse engineering statis Postman Desktop 11.86.1 (`app.asar`) yang terpasang lokal, kasus auto-install plugin AI di Postman 12.33.4 (Oktober 2026), dan pengetahuan domain |
| Status | Ide/blueprint, belum ada kode |

---

## Daftar isi

0. [Latar belakang: kenapa Packetman dibuat](#0-latar-belakang-kenapa-packetman-dibuat)
1. [Visi & positioning](#1-visi--positioning)
2. [Temuan reverse engineering Postman 11.86.1](#2-temuan-reverse-engineering-postman-11861)
3. [Persona pengguna](#3-persona-pengguna)
4. [Katalog fitur lengkap](#4-katalog-fitur-lengkap)
5. [Arsitektur teknis](#5-arsitektur-teknis)
6. [Model data](#6-model-data)
7. [Pipeline eksekusi request](#7-pipeline-eksekusi-request)
8. [Scripting sandbox & API `pm`/`pk`](#8-scripting-sandbox--api-pmpk)
9. [Desain UI/UX](#9-desain-uiux)
10. [API backend](#10-api-backend)
11. [Keamanan & privasi data](#11-keamanan--privasi-data)
12. [Struktur monorepo](#12-struktur-monorepo)
13. [Roadmap](#13-roadmap)
14. [Diferensiasi & model bisnis](#14-diferensiasi--model-bisnis)
15. [Batasan legal](#15-batasan-legal)
16. [Lampiran: ledger evidence](#16-lampiran-ledger-evidence)

---

## 0. Latar belakang: kenapa Packetman dibuat

Ide Packetman berangkat dari keresahan developer setelah kasus Postman pada Oktober 2026. Banyak konten media sosial yang beredar soal kasus ini mencampur fakta dengan klaim yang belum terbukti. Supaya produk dan materi marketing Packetman berdiri di atas fakta, berikut pemisahannya:

| Klaim yang beredar | Status | Rincian |
|---|---|---|
| Update Postman diam-diam memasang plugin AI | **Terkonfirmasi** | Postman Desktop **12.33.4** memasang plugin ke **Codex** dan **Claude Code** saat upgrade otomatis (log: `auto-existing-upgrade`). Yang ditambahkan: SessionStart hook di Codex beserta trust record-nya (installer menyetujui hook-nya sendiri), konfigurasi MCP remote ke `https://mcp.postman.com/mcp`, plugin Claude Code user-scope, dan binary CLI di `~/.local/bin`. Sumber: GitHub issue `postmanlabs/postman-app-support#14370`. |
| Postman mengubah konfigurasi tool lain tanpa izin | **Terkonfirmasi** | Lihat baris di atas. Ini masalah utamanya: aplikasi menyentuh konfigurasi tool lain dan melewati prompt persetujuan hook. |
| Plugin mengirim request, payload, token, API key (Stripe, Midtrans, dll.) ke cloud Postman | **Tidak terbukti** | Pelapor issue menyatakan laporannya tidak mengklaim telah membuktikan eksfiltrasi data. Koneksi MCP ke `mcp.postman.com` gagal karena butuh autentikasi. Judul "attempts to share all API data" di agregator berita tidak disertai bukti transmisi. |
| Ada toggle "data sharing" yang harus dimatikan | **Tidak ditemukan di sumber** | Issue dan liputan yang ditelusuri tidak menyebut toggle semacam itu. |
| Developer ramai pindah ke Bruno | Sebagian | Ada liputan soal momentum Bruno dan reaksi negatif di komunitas (issue mendapat ±99 reaksi 👍). Skala migrasinya tidak terukur. |
| Respons Postman | Fakta | Staf Postman menyatakan plugin dibundel karena banyak pengguna kesulitan memasangnya sendiri, bisa di-uninstall dari app, dan bahwa "we are reverting this change". Issue ditutup dan dikunci. |

**Insight produk:** keresahan sebenarnya bukan soal "AI itu jahat", tapi soal **kepercayaan dan kendali**:
1. Aplikasi melakukan sesuatu yang tidak diminta (memasang plugin, mengubah konfigurasi tool lain).
2. Developer tidak bisa melihat atau memverifikasi data apa yang keluar dari mesinnya.
3. Data di API client sangat sensitif: token produksi, secret key payment gateway, data pelanggan.

Packetman menjawab ketiganya secara terukur dan bisa diaudit, bukan sekadar janji (lihat §1 dan §11).

---

## 1. Visi & positioning

**Packetman** adalah workspace API yang jalan di browser: kirim request (HTTP, GraphQL, WebSocket, Socket.IO, gRPC, MQTT, SSE), susun ke dalam koleksi, otomatisasi testing, mock, monitor, dokumentasi, dan kolaborasi tim. Semuanya tanpa wajib install aplikasi desktop, **dan tanpa mengorbankan privasi data request kamu**.

**Tagline:** *"Every packet, accounted for."* Setiap paket data yang keluar dari Packetman tercatat dan bisa kamu lihat.

**Janji Privasi Packetman** (dijadikan dokumen publik dan diuji otomatis di CI):

1. **Tidak ada egress diam-diam.** Packetman tidak pernah mengirim URL, header, body, variabel, atau response kamu ke server mana pun selain tujuan request itu sendiri, kecuali untuk fitur yang kamu nyalakan secara eksplisit. Semua koneksi latar belakang aplikasi tercatat di **Egress Monitor** (§11.3).
2. **Tidak pernah menyentuh tool lain.** Packetman (web, agent, CLI, extension) tidak akan pernah menulis ke konfigurasi Claude Code, Codex, Cursor, VS Code, shell profile, atau aplikasi lain. Integrasi seperti MCP hanya berupa tombol "Copy config" yang kamu tempel sendiri.
3. **AI mati secara default.** Packetbot opt-in per workspace. Pilihannya model lokal atau API key milikmu sendiri yang dipanggil langsung dari browser. Secret otomatis di-redact sebelum dikirim, dan ada preview data yang akan dikirim.
4. **Local-first dan zero-knowledge.** Data tersimpan di perangkatmu. Sync tim dienkripsi end-to-end, jadi server Packetman hanya menyimpan ciphertext.
5. **Update tanpa kejutan.** Update tidak pernah menambah plugin, integrasi, atau izin baru tanpa persetujuan. Fitur baru yang menyentuh data selalu default OFF.
6. **Bisa diaudit.** Core, agent, CLI, dan extension open-source. Build-nya reproducible dan rilisnya ditandatangani (signed).
7. **Telemetri opt-in.** Default mati. Skemanya dipublikasikan dan tidak pernah berisi URL, header, body, atau nama variabel.

**Prinsip produk:**

1. **Web-first, tapi jujur soal batas browser.** Browser tidak bisa buka TCP mentah, tidak bisa set header terlarang (`Host`, `Cookie`, `User-Agent`, dll.), dan terkena CORS. Packetman menyelesaikan ini dengan **executor berlapis** yang mendahulukan jalur lokal: browser langsung, extension, dan desktop agent. Cloud relay hanya dipakai kalau kamu mengizinkan (lihat §5.2).
2. **Local-first.** Semua data tersimpan di IndexedDB perangkatmu. Bisa dipakai tanpa login dan tanpa koneksi ke server Packetman.
3. **Git-native.** Koleksi bisa disimpan sebagai file YAML per request di repo, jadi bisa di-diff, di-review, dan di-merge.
4. **Kompatibel & mudah migrasi.** Bisa impor/ekspor Postman Collection v2.1, OpenAPI, Insomnia, Bruno, Hoppscotch, HAR, cURL. Script `pm.*` yang sudah ada tetap jalan. Ada **Migration Assistant** dari Postman (§4.10).
5. **Bisa di-self-host.** Satu `docker compose up` untuk tim yang datanya tidak boleh keluar jaringan.

**Posisi terhadap alternatif:**

| | Postman | Bruno | **Packetman** |
|---|---|---|---|
| Platform | Desktop + web (wajib akun cloud untuk banyak fitur) | Desktop (Electron), offline | **Web, tanpa install** (agent opsional) |
| Data | Cloud-centric | 100% lokal, file di Git | Local-first + sync tim E2E terenkripsi |
| Kolaborasi tim | Lengkap (cloud) | Lewat Git | Real-time + Git, zero-knowledge |
| AI | Bawaan, terintegrasi cloud | Bukan fokus utama (cek versi terbaru) | Opt-in, model lokal/BYO key, redaksi secret |
| Transparansi egress | Tidak ada panel khusus | Tidak relevan (offline) | **Egress Monitor bawaan** |
| Kompatibilitas script `pm.*` | Native | Sebagian (punya API `bru.*` sendiri) | Target ≥98% kompatibel |
| Mock, monitor, docs publik | Ya (cloud) | Tidak ada layanan cloud bawaan | Ya, per koleksi lewat opt-in "share to cloud" |

**Pesan utama marketing:** *"Seaman Bruno, senyaman Postman, dan tinggal buka di browser."*

---

## 2. Temuan reverse engineering Postman 11.86.1

Bagian ini menjadi dasar katalog fitur di §4. Analisis dilakukan **statis** terhadap `C:\Users\adhi0\AppData\Local\Postman\app-11.86.1\resources\app.asar` (SHA-256 `e140a9a5…f6df94`) memakai REA dan pembacaan header ASAR read-only. **Kode Postman tidak dijalankan dan tidak disalin.** Yang diambil hanya inventaris modul dan nama dependensi untuk memetakan subsistem.

### 2.1 Arsitektur Postman Desktop (yang teramati)

- **Electron app**, entry `main.js`. Ada banyak jendela/halaman HTML terpisah: `requester.html` (UI utama), `runner.html` (Collection Runner), `console.html` (Postman Console), `tester_sandbox.html` (sandbox script), `webProxy.html`, `proxyAuth.html`, `auth/auth.html`, `desktop-offline.html`, `loader.html`.
- **Proses eksekusi terpisah dari UI**: `ExecutionProcess.js`, `node_modules/native_modules/execution-worker.js`, `execution-handler.js`, `process-manager.js`, `exec-child.js`. Artinya request dan script dijalankan di proses/worker sendiri, bukan di renderer.
- **Performance testing**: `perftestExecute.js`, `ThreadGroupExecutable.js`, `_thread.js`, terlihat seperti model virtual user berbasis thread group.
- **Mock server lokal**: `mock-server-runtime/http-server-worker.js`, `mock-server-runtime_electron-bridge_js…`, plus dependensi `polka`, `cors`, `@polka/send`.
- **Proxy & capture traffic**: `ProxyNodeProcess.js`, `js/webProxy.js`, `services_proxyCertificateService_js…`, `services_interceptorBridgeInstaller_js…`, plus `http-proxy`, `node-forge`, `@postman/pem`. Ini menunjukkan proxy MITM dengan CA lokal untuk menangkap traffic HTTPS.
- **AI agent**: `Agent-….min.js`, `AgentWorker.js`, `runtime_agents_IPCAgent_js…`, plus `ai` (Vercel AI SDK v5) dengan ~18 provider (`@ai-sdk/anthropic`, `openai`, `google`, `azure`, `amazon-bedrock`, `mistral`, `xai`, `deepseek`, dll.) dan `@modelcontextprotocol/sdk`.
- **Terminal terintegrasi**: `node-pty`, `shell-env`.
- **Workspace lokal berbasis file**: `@parcel/watcher` (file watcher), `@vscode/ripgrep` (pencarian), `services_workingDirManager_js…`.
- **Penyimpanan lokal**: `nedb`, `electron-json-storage`. **Secret**: `keytar` (OS keychain), `@1password/sdk`, `@postman/aes-crypto-js`.

### 2.2 Peta protokol (dari dependensi)

| Protokol | Library yang teramati |
|---|---|
| HTTP/HTTPS | `postman-request`, `undici`, `node-fetch`, `@postman/tough-cookie` (cookie jar) |
| WebSocket | `ws`, `postman-ws`, `ECWebsocketWorkbench.js` |
| Socket.IO | `socket.io-client-v2` dan `socket.io-client-v4` (dua versi sekaligus) |
| GraphQL | `graphql`, `graphql-ws`, `subscriptions-transport-ws`, `graphql.worker.js` |
| gRPC | `@postman/grpc-js`, `@postman/grpc-reflection-js`, `@postman/proto-loader`, `@postman/protobufjs` |
| MQTT | `mqtt`, `…runtime_mqtt-utils…` |

### 2.3 Peta auth (dari dependensi & modul)

`aws4` (AWS Signature v4), `openid-client` (OIDC/OAuth2), `services_OAuth2WindowManager_js…` (jendela login OAuth2), `@azure/msal-node` (Microsoft identity), `services_AppRefreshTokenManager_js…` (refresh token).

### 2.4 Importer & code generator (dari modul)

- **Importer**: `openapi-to-postmanv2`, `swagger1-to-postman`, `raml-to-postman`, `raml1-to-postman`, `wadl-to-postman`, `wsdl-to-postman`, `har-to-postman`, `curl-to-postmanv2`, `graphql-to-postman`, `dhc-to-postman`, `runscope-to-postman`, `postman-converters`.
- **Code generator**: `postman-code-generators`.
- **Format koleksi**: `postman-collection` (SDK). **Runtime eksekusi**: `postman-runtime` 7.x dan `@postman/runtime` 0.20.

### 2.5 UI (dari nama modul)

`CollectionSidebar`, `EnvironmentSidebar`, `HistorySidebarController/Container`, `WorkspaceBrowser`, `StatusBarContainer`, `RequesterModalContainer`, `CreateItemView`, `ECItemWorkbench`, `DocumentationContextBarView`, `FindReplace.worker`, `CodeCBView`. Editor punya worker per bahasa: `json`, `html`, `xml`, `yaml`, `ts`, `editor` (`*-pme_v3.worker.min.js`). Ada `pdf.worker.min.js` (preview PDF di response), `js/visualizer/vendor.min.js` (Visualizer), dan tema bawaan: Dracula, Monokai, Solarized Light/Dark, Night Owl Light/Dark, Ayu Light/Dark, High Contrast Light/Dark.

### 2.6 Yang tidak terbukti

- Hanya `package.json` yang dianalisis semantik. 275 file lain baru tercatat di inventaris dan belum ditelusuri isinya. Jadi relasi antar modul **belum** terpetakan.
- Fungsi subsistem di atas **disimpulkan dari nama file dan dependensi**, bukan dari menelusuri kode. Nama bisa menyesatkan.
- Fitur cloud-only (monitor, workspace tim, API governance, Flows, dll.) berjalan di server Postman dan tidak terlihat di `app.asar`. Bagian tersebut di §4 berasal dari pengetahuan domain, bukan evidence.
- **Versi lokal lebih tua dari versi kasus.** Yang terpasang di laptop ini adalah 11.85.1 dan 11.86.1 (keduanya diinstall 1 Maret 2026). Kasus auto-install plugin terjadi di **12.33.4** (Oktober 2026), jadi perilaku installer itu **tidak bisa** dikonfirmasi atau dibantah dari artefak lokal. Diff `package.json` 11.85.1 → 11.86.1 hanya menunjukkan bump `@postman/runtime` (0.18.3 → 0.20.1). Dependensi AI (`ai`, `@ai-sdk/*`, `@modelcontextprotocol/sdk`) sudah ada sejak 11.85.1. Itu fitur AI di dalam app, berbeda dari plugin yang dipasang ke tool lain.

---

## 3. Persona pengguna

| Persona | Kebutuhan utama | Fitur kunci |
|---|---|---|
| **Backend dev** | Uji endpoint cepat, debug, simpan request | Request builder, env vars, history, code gen |
| **Frontend/mobile dev** | Pahami kontrak API, mock saat backend belum siap | Docs, mock server, examples |
| **QA engineer** | Regression test otomatis, data-driven testing | Scripts/tests, Collection Runner, CLI di CI |
| **Tech lead / API designer** | Desain API dulu (design-first), governance | Spec editor OpenAPI, linting, versioning |
| **DevOps/SRE** | Uptime & performa API | Monitor, performance test, alert |
| **Tim/organisasi** | Kolaborasi, kontrol akses, audit | Workspace tim, RBAC, fork/merge, SSO, audit log |

---

## 4. Katalog fitur lengkap

Label prioritas: **P0** = MVP, **P1** = v1.0, **P2** = v2+.

### 4.1 Workspace & organisasi

| Fitur | Detail | Prioritas |
|---|---|---|
| Workspace | Personal, Team, Private, Public. Switcher di header. | P0 (personal), P1 (team) |
| Collections | Pohon Collection → Folder (bersarang) → Request → Example. Drag & drop, duplicate, rename, delete (soft delete + trash 30 hari). | P0 |
| Tab | Multi-tab, tab preview (italic), pin, tanda unsaved (●), "close others/right", pulihkan tab setelah reload. | P0 |
| History | Semua request terkirim dicatat per hari. Bisa disimpan ke koleksi, dicari, dihapus. | P0 |
| Global search | Cari koleksi, request, env, dan isi body/URL (Ctrl+K). | P1 |
| Command palette | Ctrl+Shift+P untuk semua aksi. | P1 |
| Favorit & recent | Bintangi koleksi/workspace. | P1 |
| Trash | Pulihkan item yang terhapus. | P1 |

### 4.2 Request builder (HTTP)

| Fitur | Detail | Prioritas |
|---|---|---|
| Method | GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS + custom method (PROPFIND, PURGE, dll.). | P0 |
| URL bar | Autocomplete variabel `{{var}}` dengan highlight (hijau jika terdefinisi, merah jika tidak), hover menampilkan nilai & scope. Path variable `:id` otomatis jadi tabel. Paste cURL di URL bar langsung diimpor. | P0 |
| Params | Tabel key/value/description, checkbox enable, bulk edit (mode teks), sync dua arah dengan URL. | P0 |
| Headers | Tabel + autocomplete nama/nilai header umum, header otomatis (hidden) yang bisa ditampilkan dan dimatikan, header preset. | P0 |
| Body | `none`, `form-data` (text + file, content-type per field), `x-www-form-urlencoded`, `raw` (JSON/XML/Text/HTML/JavaScript, dengan beautify & validasi JSON), `binary` (upload file), `GraphQL` (query + variables). | P0 |
| Settings per request | Follow redirects (+ max), ikuti method asli saat redirect, SSL verification on/off, timeout, versi HTTP (1.1/2), encode URL otomatis, disable cookie jar, strict header parsing. | P1 |
| Pre-request & post-response script | Lihat §8. | P0 |
| Save as example | Simpan response sebagai example (untuk docs & mock). | P0 |
| Request description | Markdown. | P1 |

### 4.3 Autentikasi

Bisa diatur di level koleksi, folder, atau request, dengan opsi **Inherit from parent**.

| Tipe | Prioritas |
|---|---|
| No Auth, Inherit | P0 |
| API Key (header / query) | P0 |
| Bearer Token | P0 |
| Basic Auth | P0 |
| JWT Bearer (generate & sign HS/RS/ES di klien) | P1 |
| Digest Auth | P1 |
| OAuth 2.0: Authorization Code (+PKCE), Client Credentials, Password, Implicit, Refresh Token. Token manager (simpan banyak token, auto-refresh, sinkron ke variabel). Callback via popup + `postMessage`. | P0 (Auth Code+PKCE, Client Creds), P1 (lainnya) |
| OAuth 1.0 (HMAC-SHA1/256, RSA-SHA, PLAINTEXT) | P1 |
| AWS Signature v4 | P1 |
| Hawk, NTLM, Akamai EdgeGrid, ASAP (Atlassian) | P2 |
| mTLS / client certificate per host | P1 (via agent/relay) |

### 4.4 Response viewer

| Fitur | Detail | Prioritas |
|---|---|---|
| Status bar | Kode + teks status (warna per kelas), waktu, ukuran (header + body), tombol simpan. | P0 |
| Body | Pretty (syntax highlight JSON/XML/HTML/JS), Raw, Preview (HTML di iframe tersandbox, gambar, PDF, audio/video), JSON tree collapsible, word wrap, cari di dalam response. | P0 |
| Filter JSON | JSONPath / JMESPath filter langsung di response. | P1 |
| Headers & cookies | Tabel. Cookie yang diterima tampil dengan atribut. | P0 |
| Test results | Pass/fail per test, filter. | P0 |
| Timeline / network | Breakdown waktu (DNS, TCP, TLS, TTFB, download), remote address, info sertifikat TLS, request yang benar-benar terkirim (header final). | P1 |
| Visualizer | `pm.visualizer.set(template, data)` → render HTML (Handlebars) di iframe tersandbox. | P1 |
| Download | Simpan body ke file. | P0 |
| Diff response | Bandingkan response sekarang dengan example atau run sebelumnya. | P2 |

### 4.5 Variabel & environment

| Fitur | Detail | Prioritas |
|---|---|---|
| Scope | Urutan prioritas (tinggi → rendah): **Local** (script) → **Data** (file iterasi) → **Environment** → **Collection** → **Global**. Tampilkan scope aktif di tooltip. | P0 |
| Initial vs Current value | Initial value di-sync ke tim. Current value hanya lokal (tidak di-sync), cocok untuk token pribadi. | P0 |
| Tipe | `default`, `secret` (masked, tidak ikut ekspor), `vault` (rujukan ke vault). | P0 (default/secret), P1 (vault) |
| Environment switcher | Dropdown di kanan atas + quick look (ikon mata). | P0 |
| Dynamic variables | `{{$guid}}`, `{{$timestamp}}`, `{{$isoTimestamp}}`, `{{$randomInt}}`, `{{$randomEmail}}`, `{{$randomFullName}}`, dan ±100 variabel faker lain. | P1 |
| Vault | Secret dienkripsi end-to-end di klien (lihat §11), opsional integrasi 1Password / HashiCorp Vault / AWS Secrets Manager / Azure Key Vault. | P2 |

### 4.6 Collection Runner & otomasi

| Fitur | Detail | Prioritas |
|---|---|---|
| Runner manual | Pilih koleksi/folder, urutkan dan pilih request, jumlah iterasi, delay antar request, data file (CSV/JSON), simpan response opsional, persist variabel, stop on error. | P0 |
| Hasil run | Ringkasan pass/fail, durasi, filter, detail per iterasi, ekspor JSON/HTML/JUnit. Riwayat run tersimpan. | P0 |
| Alur kendali | `pm.execution.setNextRequest(name)` dan `pm.execution.skipRequest()`. | P1 |
| Scheduled run | Jalankan koleksi di cloud tiap interval (cron). | P1 |
| Performance test | Virtual users, pola beban (fixed, ramp-up, spike, peak), durasi. Metrik: throughput, p50/p90/p95/p99, error rate. Grafik real-time. | P2 |
| CLI `packetman` | Setara Newman: `packetman run collection.json -e env.json -d data.csv -r cli,junit,html`. Untuk CI (GitHub Actions, GitLab CI, Jenkins). | P1 |

### 4.7 Multi-protokol

| Protokol | Fitur | Prioritas |
|---|---|---|
| **GraphQL** | Introspeksi schema otomatis, explorer (klik field untuk membangun query), autocomplete & validasi query, variables, multiple operations, subscription via `graphql-ws` dan `subscriptions-transport-ws`. | P1 |
| **WebSocket** | Connect/disconnect, header & subprotocol handshake, kirim pesan (text/JSON/binary), saved messages, log pesan dua arah dengan timestamp & filter, auto-reconnect. | P1 |
| **Socket.IO** | v2/v3/v4, listen event tertentu, emit event + ack, namespace. | P1 |
| **SSE** | Stream `text/event-stream`, tampilkan event per baris. | P1 |
| **gRPC** | Impor `.proto` (multi-file, import path) atau server reflection. Unary, server streaming, client streaming, bidirectional. Metadata, TLS, deadline, contoh pesan JSON otomatis dari schema. **Butuh agent/relay** (browser tidak bisa HTTP/2 trailer). | P2 |
| **MQTT** | Connect (v3.1.1/v5), subscribe topik (wildcard), publish dengan QoS/retain, log pesan. **Butuh agent/relay** (TCP). | P2 |
| **SOAP** | Impor WSDL, generate envelope. | P2 |

### 4.8 Mock server

| Fitur | Detail | Prioritas |
|---|---|---|
| Mock dari koleksi | Tiap example jadi route mock. URL publik: `https://<id>.mock.packetman.dev`. | P1 |
| Matching | Method + path (dengan path variable) + query/header/body opsional. Header `x-mock-response-name` / `x-mock-response-code` untuk memilih example tertentu. | P1 |
| Delay & error simulation | Latency buatan, response error acak. | P1 |
| Dynamic template | `{{$randomFullName}}` dan faker di body mock. | P2 |
| Private mock | Butuh API key. | P1 |
| Mock lokal | Lewat desktop agent di `localhost:PORT`. | P2 |
| Log | Riwayat call yang masuk ke mock. | P1 |

### 4.9 Monitor

Menjalankan koleksi terjadwal (5 menit sampai mingguan) dari beberapa region. Notifikasi via email, Slack, webhook, atau PagerDuty kalau test gagal atau response lambat. Dashboard uptime, rata-rata response time, dan riwayat. **P1** (dasar), **P2** (multi-region).

### 4.10 Impor / ekspor

| Format | Impor | Ekspor | Prioritas |
|---|---|---|---|
| Postman Collection v2.0/v2.1 + environment + globals + data dump | ✓ | ✓ | P0 |
| cURL (paste & file) | ✓ | ✓ (via code gen) | P0 |
| OpenAPI 3.0/3.1, Swagger 2.0 (JSON/YAML, URL/file) | ✓ | ✓ | P0 |
| Insomnia v4/v5 | ✓ | | P1 |
| Hoppscotch, Bruno (`.bru`), Thunder Client | ✓ | ✓ (Bruno) | P1 |
| HAR | ✓ | ✓ | P1 |
| GraphQL schema (SDL/introspection) | ✓ | | P1 |
| RAML 0.8/1.0, WADL, WSDL | ✓ | | P2 |
| Repo Git (folder YAML Packetman) | ✓ | ✓ | P1 |

**Migration Assistant dari Postman (P0).** Ini fitur andalan untuk menangkap pengguna yang sedang resah:
1. Seret file ekspor Postman (koleksi, environment, globals, atau *data dump* lengkap).
2. **Secret scrub:** semua variabel dipindai. Nilai yang terdeteksi sebagai secret (pola Stripe `sk_live_`/`rk_live_`, Midtrans Server Key, JWT, AWS key, `Bearer …`, password) otomatis diberi tipe `secret` dan disimpan hanya lokal atau di vault.
3. **Laporan kompatibilitas script:** daftar `pm.*` yang didukung penuh, sebagian, atau belum, per request.
4. **Checklist pembersihan (panduan, bukan otomatis):** halaman yang menjelaskan cara memeriksa apakah ada plugin/hook/MCP Postman di `~/.codex/config.toml`, plugin Claude Code, dan `~/.local/bin`, plus cara menghapusnya secara manual. Packetman sendiri **tidak** menyentuh file tersebut, sesuai Janji Privasi poin 2.

### 4.11 Code generation

Panel `</>` di sisi kanan request. Snippet diperbarui live, dengan opsi (indentasi, timeout, follow redirect, trim body). Bahasa:

cURL, HTTPie, wget, PowerShell (`Invoke-RestMethod`), JavaScript (fetch, axios, jQuery, XHR), Node.js (native, axios, request, undici), Python (requests, http.client, httpx), Go (net/http), Java (OkHttp, Unirest, HttpClient), Kotlin (OkHttp), C# (HttpClient, RestSharp), PHP (cURL, Guzzle, HTTP_Request2), Ruby (Net::HTTP), Swift (URLSession), Dart (http, dio), Rust (reqwest), C (libcurl), Objective-C, R (httr), OCaml, Shell. **P0** (5 bahasa utama), **P1** (sisanya).

### 4.12 API design (design-first)

| Fitur | Detail | Prioritas |
|---|---|---|
| Spec editor | Editor OpenAPI 3.x / AsyncAPI / GraphQL SDL dengan split view (kode ↔ preview docs), autocomplete schema, `$ref` lintas file. | P2 |
| Linting | Aturan bawaan + kustom (gaya Spectral): penamaan, wajib ada deskripsi, keamanan. Rule set per organisasi (governance). | P2 |
| Generate | Spec → koleksi, koleksi → spec, sinkron dua arah dengan deteksi perubahan. | P2 |
| Versioning | Rilis versi API, changelog, deteksi breaking change. | P2 |
| Contract testing | Validasi response terhadap schema OpenAPI secara otomatis di runner. | P2 |

### 4.13 Dokumentasi

Docs otomatis dari koleksi (deskripsi markdown, request, example, code snippet multi-bahasa). Publish ke `docs.packetman.dev/<slug>` atau custom domain, dengan tema/logo, tombol "Run in Packetman" (fork ke workspace), dan versi. **P1**.

### 4.14 Kolaborasi

| Fitur | Detail | Prioritas |
|---|---|---|
| Tim & undangan | Undang via email/link. Domain capture. | P1 |
| RBAC | Peran workspace: Admin, Editor, Viewer. Peran per koleksi. Peran organisasi: Owner, Admin, Billing, Member. | P1 |
| Real-time | Presence (avatar di tab), edit bersama (CRDT/Yjs), kursor. | P2 |
| Komentar | Pada request/folder/field tertentu, dengan @mention dan resolve. | P1 |
| Fork & pull request | Fork koleksi → ubah → ajukan PR → diff visual → review/approve → merge (dengan resolusi konflik). | P2 |
| Version history | Changelog per koleksi, restore ke titik tertentu. | P1 |
| Share link | Link ke request/koleksi dengan izin view. Embed "Run" button. | P1 |
| Activity feed | Siapa mengubah apa. | P1 |

### 4.15 Capture, proxy, cookie & sertifikat

| Fitur | Detail | Prioritas |
|---|---|---|
| Cookie manager | Cookie jar per domain: lihat, tambah, edit, hapus. Whitelist domain yang boleh diakses script. | P0 |
| Capture via extension | Browser extension "Packetman Interceptor" menangkap request dari tab tertentu (filter URL/method) → masuk ke history/koleksi. Sinkron cookie browser ↔ Packetman. | P2 |
| Capture via proxy | Desktop agent menjalankan proxy HTTP(S) dengan CA lokal (install CA dipandu). Untuk menangkap traffic HP/aplikasi. | P2 |
| Proxy keluar | Pakai system proxy / custom proxy (HTTP, SOCKS5) + auth + bypass list. | P1 (agent) |
| Sertifikat | CA kustom, client cert (PEM/PFX + passphrase) per host. | P1 (agent/relay) |

### 4.16 Console

Panel log bawah (Ctrl+Alt+C): setiap request dengan header/body mentah terkirim & diterima, `console.log/info/warn/error` dari script, error jaringan, redirect chain, dan detail TLS. Ada filter level dan pencarian. **P0**.

### 4.17 Flows (visual workflow)

Canvas node-based tanpa kode: blok Send Request, Condition, Loop, Delay, Evaluate (FQL/JS), Output/Chart. Untuk chaining API dan demo. **P2**.

### 4.18 Packetbot (AI assistant): privacy-first by design

Postman 11.86 sudah punya AI SDK dan MCP bawaan (§2.1), dan kasus 12.33.4 (§0) menunjukkan apa yang terjadi kalau AI diintegrasikan tanpa persetujuan. Packetbot dirancang sebaliknya: **mati secara default, data minimal, dan semuanya terlihat.**

**Aturan main Packetbot:**

| Aturan | Implementasi |
|---|---|
| **Default OFF** | Tidak ada panel, tidak ada request ke model, dan tidak ada model yang diunduh sebelum user menyalakan Packetbot di Settings → AI. Admin workspace bisa mengunci AI = OFF untuk seluruh tim. |
| **Pilih sumber model** | (1) **Lokal di browser** pakai WebLLM/WebGPU, model kecil yang diunduh sekali dan tidak ada data yang keluar. (2) **Lokal di mesin** pakai Ollama/LM Studio via endpoint OpenAI-compatible di `localhost`. (3) **BYO API key** (Anthropic, OpenAI, Google, dll.) yang dipanggil **langsung dari browser ke provider**, tidak lewat server Packetman. Key disimpan terenkripsi lokal. (4) Packetman Cloud AI, opsional untuk paket berbayar, dengan zero data retention yang tertulis di kontrak. |
| **Redaksi otomatis** | Sebelum prompt dikirim, nilai yang cocok dengan pola berikut diganti placeholder (`«SECRET:stripe_key»`): header `Authorization`/`Cookie`/`X-Api-Key`, variabel bertipe `secret`/`vault`, pola Stripe `sk_live_`, Midtrans Server Key, JWT, AWS `AKIA…`, private key PEM, nomor kartu (Luhn), email/NIK/nomor HP (opsional, untuk data pribadi). Aturan redaksi bisa ditambah per workspace (regex). |
| **Preview sebelum kirim** | Setiap aksi AI menampilkan "Data yang akan dikirim ke [provider]" (diff yang sudah di-redact). User menekan Kirim. Bisa diatur "jangan tanya lagi" per jenis aksi. |
| **Konteks minimal** | Default hanya struktur request (method, path template, nama header tanpa nilai, schema body) dan response yang sudah di-redact. Body lengkap hanya dikirim kalau user mencentangnya. |
| **Tercatat** | Setiap panggilan AI masuk ke Egress Monitor (§11.3) dan audit log workspace: waktu, provider, ukuran, jumlah item yang di-redact. |

**Fitur:**

| Fitur | Detail | Prioritas |
|---|---|---|
| Generate tests | Dari response, buat `pm.test` otomatis (status, schema, field). | P1 |
| Explain & debug | Jelaskan error 4xx/5xx, usulkan perbaikan header/body/auth. | P1 |
| Natural language → request | "buat POST ke /users dengan body nama & email" → request terisi. | P1 |
| Docs generator | Tulis deskripsi request/koleksi. | P1 |
| Visualizer generator | "buat tabel dari array users" → template visualizer. | P2 |
| MCP client | Uji MCP server (tools, resources, prompts) seperti menguji API biasa. | P2 |
| Koleksi sebagai MCP server | Ekspor koleksi jadi MCP server lokal (via agent/CLI) agar request bisa dipakai agent AI. Integrasinya **hanya** lewat tombol "Copy config" atau instruksi manual. Packetman tidak pernah menulis ke `~/.codex`, `~/.claude`, `.cursor`, atau konfigurasi tool lain. | P2 |

### 4.19 Integrasi

GitHub/GitLab/Bitbucket (sync koleksi ke repo), Slack/Microsoft Teams (notifikasi), webhook umum, CI (template GitHub Actions untuk CLI), API publik Packetman (CRUD koleksi/env via API key), dan import dari URL. **P1-P2**.

### 4.20 Pengaturan & UI

Tema: Light, Dark, System, plus tema editor (Dracula, Monokai, Solarized, Night Owl, Ayu, High Contrast; buat palet sendiri). Ukuran font, layout dua panel (response di bawah atau samping), shortcut yang bisa diubah, bahasa UI (ID/EN), dan pengaturan request default (timeout, SSL, redirect). **P0-P1**.

### 4.21 Admin & enterprise

SSO (SAML, OIDC), SCIM provisioning, audit log (ekspor), secret scanner (mendeteksi token yang bocor di koleksi publik), kebijakan domain (hanya email perusahaan), region data, retensi data, self-host. **P2**.

---

## 5. Arsitektur teknis

### 5.1 Gambaran besar

```
┌───────────────────────────── Browser ─────────────────────────────┐
│  Packetman Web App (Next.js + React)                              │
│  ┌──────────┐  ┌────────────┐  ┌───────────┐  ┌───────────────┐   │
│  │  UI      │  │ Core       │  │ Script    │  │ Local store   │   │
│  │ (shadcn, │→ │ (resolver, │→ │ sandbox   │  │ IndexedDB     │   │
│  │  Monaco) │  │  auth,     │  │ QuickJS-  │  │ (Dexie) +     │   │
│  └──────────┘  │  builder)  │  │ wasm      │  │ sync queue    │   │
│                └─────┬──────┘  └───────────┘  └──────┬────────┘   │
│                      │ ExecutorAdapter                │           │
└──────────────────────┼────────────────────────────────┼───────────┘
        ┌──────────────┼───────────────┬────────────────┘
        ▼              ▼               ▼                ▼
 ┌────────────┐ ┌─────────────┐ ┌─────────────┐  ┌─────────────────┐
 │ Direct     │ │ Browser     │ │ Desktop     │  │ Packetman API   │
 │ fetch()    │ │ Extension   │ │ Agent       │  │ (sync, auth,    │
 │ (jika CORS │ │ (MV3, bypass│ │ (Go/Rust,   │  │  teams, docs)   │
 │  mengizin- │ │  CORS,      │ │  localhost  │  └───────┬─────────┘
 │  kan)      │ │  cookies)   │ │  WS :41414) │          │
 └────────────┘ └─────────────┘ └─────────────┘          ▼
                                       │          ┌─────────────────┐
                Cloud Relay ◄──────────┘          │ Postgres, Redis,│
                (executor server-side,            │ Object storage  │
                 HTTP/WS/gRPC/MQTT,               └─────────────────┘
                 anti-SSRF)                ┌──────────────────────────┐
                                           │ Workers: runner, monitor,│
                                           │ mock server, perf test   │
                                           └──────────────────────────┘
```

### 5.2 Executor berlapis (inti masalah web-based)

Di browser, `fetch()` biasa tidak cukup: kena CORS, tidak bisa set `Host`/`Cookie`/`Origin`/`User-Agent`, tidak bisa membaca `Set-Cookie`, tidak bisa akses mTLS atau sertifikat self-signed, dan tidak bisa TCP mentah (MQTT) maupun HTTP/2 trailer (gRPC). Karena itu semua request dikirim lewat satu interface `ExecutorAdapter` dengan beberapa implementasi:

| Mode | Cara kerja | Bisa | Tidak bisa | Kapan dipakai |
|---|---|---|---|---|
| **Direct** | `fetch()` dari browser | Cepat, tanpa perantara | CORS, header terlarang, cookie, timing detail | API publik dengan CORS terbuka |
| **Extension** | Browser extension (Manifest V3) via `declarativeNetRequest` + background fetch | Bypass CORS, akses cookie browser, localhost | TCP/gRPC, mTLS, timing detail | Dev yang tidak mau install app |
| **Desktop Agent** | Binary kecil (Go/Rust, ±10 MB) yang membuka WebSocket di `127.0.0.1:41414`, dipasangkan dengan token pairing | Semua: localhost, jaringan internal, mTLS, proxy, gRPC, MQTT, timing lengkap, mock lokal, capture proxy | Harus install | Default yang disarankan untuk developer |
| **Cloud Relay** | Request dikirim ke executor server Packetman (atau server self-host milikmu) | Semua protokol, tanpa install | Tidak bisa akses localhost/jaringan internal, latensi tambahan, **data melewati server** | **Opt-in saja**, untuk API publik ketika jalur lokal tidak tersedia |

**Auto mode (privacy-first):** urutan pilihan adalah **Agent → Extension → Direct**. Jalur lokal selalu didahulukan. **Relay tidak pernah dipakai diam-diam.** Kalau semua jalur lokal gagal (mis. CORS ditolak dan agent/extension belum terpasang), Packetman menampilkan dialog:

> *"Request ini tidak bisa dikirim langsung dari browser karena CORS. Pilih: [Pasang Agent (disarankan)] · [Pasang Extension] · [Kirim lewat Relay sekali] · [Selalu izinkan Relay untuk domain ini]"*

Persetujuan relay disimpan per workspace dan per domain, dan bisa dicabut kapan saja. Admin bisa memblokir relay untuk seluruh tim. Relay bersifat **stateless dan tanpa log payload**: hanya metadata (waktu, ukuran, status code, hash domain) untuk rate limit, disimpan maksimal 24 jam. Region relay bisa dipilih (mis. Jakarta/Singapura untuk kebutuhan UU PDP). Status mode aktif selalu tampil di status bar.

**Protokol Agent ↔ Web (JSON-RPC via WebSocket):**

```jsonc
// web → agent
{ "id": "r1", "method": "http.send", "params": { "request": { /* ResolvedRequest */ }, "options": { "timeoutMs": 30000, "followRedirects": true, "maxRedirects": 10, "strictSSL": true, "proxy": null, "clientCert": null } } }
// agent → web (streaming event untuk WS/gRPC/SSE/MQTT)
{ "id": "r1", "event": "response.headers", "data": { "status": 200, "headers": [["content-type","application/json"]] } }
{ "id": "r1", "event": "response.body.chunk", "data": "base64..." }
{ "id": "r1", "event": "response.done", "data": { "timings": { "dns": 3, "tcp": 12, "tls": 25, "ttfb": 80, "download": 5, "total": 125 }, "remoteAddress": "1.2.3.4:443", "tls": { "protocol": "TLSv1.3", "cipher": "...", "peerCert": { } } } }
```

Method lain: `ws.connect/send/close`, `sio.connect/emit`, `grpc.loadProto/reflect/invoke`, `mqtt.connect/subscribe/publish`, `sse.connect`, `mock.start/stop`, `proxy.start/stop`, `cert.list`.

### 5.3 Stack yang direkomendasikan

| Lapisan | Pilihan | Alasan |
|---|---|---|
| Frontend | **Next.js (App Router) + React + TypeScript** | SSR untuk halaman docs publik, SPA untuk workspace |
| UI kit | Tailwind CSS + shadcn/ui + Radix | Komponen accessible, mudah dikustom |
| Editor | Monaco Editor (JSON/JS/XML/YAML/GraphQL + worker per bahasa) | Setara dengan worker editor di Postman (§2.5) |
| State | Zustand (UI/tab) + TanStack Query (server state) | Ringan |
| Local DB | IndexedDB via Dexie | Offline-first |
| Realtime collab | Yjs + y-websocket / Hocuspocus | CRDT, presence |
| Layout panel | `react-resizable-panels` | Split pane |
| Tree | `react-arborist` atau dnd-kit | Virtualized tree dengan drag & drop |
| Backend API | Node.js + Hono/Fastify (atau route handler Next.js) + tRPC/REST | Satu bahasa (TS) dari depan sampai belakang |
| DB | PostgreSQL + Drizzle ORM | Relasional; JSONB untuk payload request |
| Cache/queue | Redis + BullMQ | Antrean runner, monitor, rate limit |
| Object storage | S3-compatible (R2/S3/MinIO) | File upload, hasil run, ekspor |
| Executor (relay & agent) | **Go** (net/http, gorilla/websocket, grpc-go + reflection, paho.mqtt) | Satu binary, cepat, mudah cross-compile; kode executor dipakai bersama oleh relay & agent |
| Script sandbox | QuickJS (wasm) di browser dan relay; `isolated-vm` sebagai alternatif di Node | Isolasi, batas memori & waktu |
| Auth | Better Auth / Auth.js (email, Google, GitHub, SSO SAML/OIDC di enterprise) | |
| Billing | Stripe | |
| Observability | OpenTelemetry + Sentry | |
| Deploy | Web + API di Vercel atau container; relay, worker & mock di container (Fly.io/Kubernetes); self-host via Docker Compose/Helm | Relay butuh koneksi jangka panjang (WS/gRPC stream) |

### 5.4 Alur local-first & sync terenkripsi end-to-end

1. Semua mutasi ditulis ke IndexedDB dulu (optimistic) dan dicatat di `sync_queue` (`op`, `entity`, `id`, `patch`, `baseVersion`).
2. **Sebelum dikirim, setiap patch dienkripsi di klien** dengan *workspace key* (AES-256-GCM). Server hanya menerima `{entity_id, version, ciphertext, iv}`. Metadata yang dibutuhkan untuk routing (ID workspace, ID entity, tipe entity, versi) tetap plaintext. Nama koleksi, URL, header, body, dan script terenkripsi semua.
3. **Manajemen kunci:** setiap user punya pasangan kunci (X25519) yang private key-nya dibungkus passphrase/passkey (Argon2id / WebAuthn PRF). Workspace key dibagikan ke anggota dengan dienkripsi ke public key masing-masing. Mengeluarkan anggota berarti rotasi workspace key. Ada **recovery kit** (kode pemulihan) saat onboarding.
4. Konflik: *last-writer-wins* per field dengan `version`. Untuk dokumen yang sedang diedit bersamaan (body, script, deskripsi), pakai Yjs. Update Yjs juga dienkripsi sebelum dikirim, dan server hanya merelay serta menyimpan blob terenkripsi.
5. `GET /sync/pull?since=cursor` mengambil perubahan dari tim. Push realtime via WebSocket channel per workspace.
6. Mode tanpa akun: data hanya lokal, tanpa satu pun koneksi ke server Packetman (diverifikasi oleh tes egress otomatis di CI). Saat login, data lokal bisa di-"claim" ke workspace.

**Konsekuensi zero-knowledge (dijelaskan jujur ke user):** fitur yang harus dijalankan server (mock cloud, monitor, scheduled run, docs publik, pencarian lintas tim di server) butuh plaintext. Karena itu fitur ini memakai **"Share to Cloud" per koleksi**: user memilih koleksi tertentu untuk didekripsi dan diunggah ke layanan tersebut, lengkap dengan peringatan yang jelas dan label 🌐 di sidebar. Variabel `secret` tidak pernah ikut terunggah. Untuk monitor, secret disuntikkan dari vault saat run dan tidak disimpan. Alternatifnya, jalankan monitor/mock di agent lokal atau server self-host.

### 5.5 Format file Git-native

```
my-api/
├── packetman.yaml            # metadata koleksi, auth & variabel koleksi, script koleksi
├── environments/
│   ├── dev.yaml
│   └── prod.yaml             # nilai secret TIDAK ditulis; hanya nama + tipe
├── users/
│   ├── _folder.yaml          # auth/script level folder
│   ├── 01-list-users.req.yaml
│   └── 02-create-user.req.yaml
└── auth/
    └── login.req.yaml
```

```yaml
# users/02-create-user.req.yaml
name: Create user
method: POST
url: "{{baseUrl}}/users"
headers:
  - { key: Content-Type, value: application/json }
body:
  mode: raw
  language: json
  raw: |
    { "name": "{{$randomFullName}}", "email": "{{$randomEmail}}" }
auth: { type: inherit }
scripts:
  postResponse: |
    pm.test("201 Created", () => pm.response.to.have.status(201));
    pm.collectionVariables.set("userId", pm.response.json().id);
examples:
  - name: Success
    status: 201
    body: '{ "id": 1, "name": "Budi" }'
```

---

## 6. Model data

Skema di bawah adalah **model logis**. Model yang sama dipakai di IndexedDB (klien) dan di server untuk koleksi yang di-"Share to Cloud".

**Penyimpanan fisik di server (mode E2E, default)** tidak menyimpan kolom konten dalam plaintext:

```
encrypted_entities(id, workspace_id, entity_type, parent_id?, version,
                   ciphertext bytea, iv bytea, key_version int,
                   updated_by, updated_at, deleted_at)
workspace_keys(workspace_id, user_id, key_version, wrapped_key bytea)   -- dienkripsi ke public key user
user_keys(user_id, public_key, wrapped_private_key, kdf_params jsonb)
```

Tabel plaintext di bawah hanya terisi untuk entitas yang dibutuhkan server: akun, keanggotaan, billing, dan koleksi yang secara eksplisit di-"Share to Cloud" (mock, monitor, docs publik).

Semua tabel punya `id uuid pk`, `created_at`, `updated_at`, `deleted_at` (soft delete), dan `version int`.

```
users(id, email, name, avatar_url, password_hash?, locale)
organizations(id, name, slug, plan, sso_config jsonb)
org_members(org_id, user_id, role[owner|admin|billing|member])
teams(id, org_id, name)
workspaces(id, org_id?, owner_id, name, type[personal|team|private|public], description)
workspace_members(workspace_id, user_id, role[admin|editor|viewer])

collections(id, workspace_id, name, description, auth jsonb, scripts jsonb,
            variables jsonb, schema_version, forked_from_id?, git_remote?)
folders(id, collection_id, parent_folder_id?, name, description, auth jsonb,
        scripts jsonb, sort_index)
requests(id, collection_id, folder_id?, name, protocol[http|graphql|ws|sio|grpc|mqtt|sse],
         method, url, params jsonb, headers jsonb, body jsonb, auth jsonb,
         scripts jsonb, settings jsonb, description, sort_index)
examples(id, request_id, name, original_request jsonb, status, headers jsonb,
         body text, body_ref?)          -- body besar → object storage

environments(id, workspace_id, name, color)
variables(id, owner_type[env|collection|global], owner_id, key, initial_value,
          type[default|secret|vault], enabled, description)
          -- current_value TIDAK disimpan di server (lokal saja)

history(id, user_id, workspace_id, request_snapshot jsonb, response_meta jsonb,
        response_body_ref?, executed_at, executor[direct|ext|agent|relay])
cookies(id, user_id, workspace_id, domain, path, name, value_enc, expires, flags jsonb)

runs(id, collection_id, folder_id?, trigger[manual|schedule|cli|monitor|ci],
     config jsonb, status, started_at, finished_at, stats jsonb, environment_id?)
run_results(id, run_id, iteration, request_id, status_code, time_ms, size,
            tests jsonb, error?, response_ref?)

mocks(id, collection_id, environment_id?, subdomain, is_private, api_key_hash, delay_ms)
mock_logs(id, mock_id, method, path, matched_example_id?, status, at)
monitors(id, collection_id, environment_id?, cron, regions text[], notify jsonb, enabled)

apis(id, workspace_id, name)
api_versions(id, api_id, version, spec_format, spec text, linked_collection_ids uuid[])
lint_rulesets(id, org_id, rules jsonb)

comments(id, entity_type, entity_id, field_path?, author_id, body, resolved, parent_id?)
pull_requests(id, source_collection_id, target_collection_id, author_id,
              title, description, status, diff jsonb, reviewers uuid[])
changelog(id, entity_type, entity_id, actor_id, action, patch jsonb, at)
audit_logs(id, org_id, actor_id, action, target, ip, ua, at)
api_keys(id, user_id, name, hash, scopes text[], last_used_at)
vault_items(id, user_id, key, ciphertext, iv, kdf_salt)   -- E2E, server tidak bisa baca
```

Representasi internal koleksi dibuat **superset dari Postman Collection v2.1** (skema publik), supaya impor/ekspor bisa lossless. Field tambahan Packetman disimpan di `x-packetman`.

---

## 7. Pipeline eksekusi request

```
[Klik Send]
   │
   ├─ 1. Snapshot request + kumpulkan rantai parent (collection → folder… → request)
   ├─ 2. Bangun scope variabel (global → collection → env → data → local)
   ├─ 3. Jalankan pre-request script berurutan: collection → folder(s) → request
   │       (di sandbox; script boleh ubah variabel, header, body, URL)
   ├─ 4. Resolve variabel {{…}} + dynamic vars ($guid, $timestamp, …)
   ├─ 5. Terapkan auth (inherit → cari ke atas). OAuth2 refresh bila expired.
   │       Signing (AWS v4, OAuth1, Hawk, Digest) dilakukan TERAKHIR,
   │       setelah body final
   ├─ 6. Tambahkan header otomatis (User-Agent: PacketmanRuntime/x.y,
   │       Accept, Content-Type, Content-Length, Cookie dari jar)
   ├─ 7. Pilih executor (§5.2) → kirim → terima stream response + timings
   ├─ 8. Update cookie jar dari Set-Cookie
   ├─ 9. Jalankan post-response script: collection → folder(s) → request
   │       (pm.test, pm.expect, set variabel, visualizer)
   ├─10. Tampilkan response, test result, console log
   └─11. Simpan ke history (+ sync), simpan perubahan current value lokal
```

Collection Runner memakai pipeline yang sama dalam loop: iterasi × urutan request, dengan dukungan `setNextRequest`, data file per iterasi, dan delay. Untuk run di cloud (schedule/monitor/CLI), pipeline yang sama dijalankan di worker memakai paket `@packetman/runtime` (isomorphic TS) dengan executor Go.

---

## 8. Scripting sandbox & API `pm`/`pk`

### 8.1 Desain

- Runtime **QuickJS-wasm** (`quickjs-emscripten`), satu context per eksekusi. Batas waktu default 10 detik dan memori 64 MB, bisa diatur.
- Objek global: `pk` (API native Packetman) dan **`pm` sebagai alias yang kompatibel**, supaya script hasil impor tetap jalan.
- Library bawaan yang bisa di-`require()`: `chai`, `lodash`, `dayjs` (alias `moment`), `crypto-js`, `uuid`, `ajv` (alias `tv4`), `cheerio`, `xml2js`, `csv-parse/sync`, `atob`, `btoa`, `url`, `querystring`, `buffer`.
- **Package library**: snippet/script reusable per workspace yang bisa di-`require('@workspace/nama')`.
- Async: `pk.sendRequest()`, `setTimeout`, dan `await` di top-level didukung. Event loop sandbox di-drain sebelum lanjut ke langkah berikutnya.

### 8.2 Permukaan API (kompatibel)

```js
// Variabel
pm.variables.get/set/has/unset/replaceIn("{{x}}")
pm.environment.get/set/unset/has/toObject/clear
pm.collectionVariables.get/set/unset
pm.globals.get/set/unset
pm.iterationData.get/toObject

// Request (bisa diubah di pre-request)
pm.request.url / .method / .headers.add/upsert/remove / .body / .auth
// Response (post-response)
pm.response.code / .status / .headers / .responseTime / .responseSize
pm.response.text() / .json() / .cookies
pm.response.to.have.status(200) / .header("X") / .jsonBody("a.b") / .be.ok

// Test & assertion
pm.test("nama", () => { pm.expect(x).to.eql(1) })
pm.expect(...)  // chai BDD
pm.response.to.have.jsonSchema(schema)

// Lain-lain
pm.sendRequest(reqOrUrl, (err, res) => {})   // + versi Promise
pm.cookies.get/has/toObject ; pm.cookies.jar().set/get/clear
pm.execution.setNextRequest("Name"|null) ; pm.execution.skipRequest()
pm.execution.location   // path koleksi → folder → request
pm.visualizer.set(template, data, options)
pm.info.requestName / .iteration / .iterationCount / .eventName
console.log/info/warn/error   → Packetman Console
```

### 8.3 Keamanan sandbox

Tidak ada akses DOM, `fetch`, `XMLHttpRequest`, `localStorage`, atau `eval` host. Jaringan hanya lewat `pk.sendRequest`, yang juga melewati executor dan aturan anti-SSRF. Akses cookie dibatasi whitelist domain.

---

## 9. Desain UI/UX

### 9.1 Layout utama

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◆ Packetman  [Workspace: Tim Backend ▾]   🔍 Search (Ctrl+K)     [Invite] ⚙ 👤│
├────┬──────────────────────┬──────────────────────────────────────────────────┤
│ 📁 │ Collections   [+] ⋯  │ [GET Users ●][POST Login][WS Chat][+]   [Env: dev ▾]👁│
│ 🌐 │ ▾ 📦 Shop API        │ ┌──────────────────────────────────────────────┐ │
│ 🕘 │   ▾ 📂 Users         │ │ GET ▾ │ {{baseUrl}}/users?page=1    │ Send ▾ │ │
│ 🧩 │      GET  List users │ └──────────────────────────────────────────────┘ │
│ 🎭 │      POST Create     │ Params  Auth  Headers(8)  Body  Scripts  Settings│
│ 📈 │   ▸ 📂 Orders        │ ┌───────────┬──────────┬───────────────┐         │
│ 🔀 │ ▸ 📦 Payment API     │ │ ☑ page    │ 1        │ nomor halaman │         │
│    │                      │ └───────────┴──────────┴───────────────┘         │
│    │                      ├──────────────────────────────────────────────────┤
│    │                      │ Body  Cookies  Headers(12)  Tests(3/3)   200 OK  │
│    │                      │                          124 ms  2.3 KB  Save ▾  │
│    │                      │ Pretty  Raw  Preview  Visualize   JSON ▾  🔍 ⧉   │
│    │                      │ 1 {                                              │
│    │                      │ 2   "data": [ { "id": 1, "name": "Budi" } ]      │
├────┴──────────────────────┴──────────────────────────────────────────────────┤
│ ● Agent  ⚡ Local  🛡 Egress: 0 bg  🤖 AI: off  Console Runner Cookies Vault ?│
└──────────────────────────────────────────────────────────────────────────────┘
 Ikon kiri: Collections · Environments · History · APIs · Mock Servers · Monitors · Flows
 Panel kanan (toggle): </> Code · 💬 Comments · ℹ Info · 📄 Docs · 🤖 Packetbot
```

### 9.2 Prinsip UX

- **Kecepatan:** buka app ke request baru dalam < 1 detik (Ctrl+T), Send dengan Ctrl+Enter, pindah tab dengan Ctrl+Tab.
- **Bisa ditebak:** variabel berwarna (terdefinisi/tidak), tanda unsaved, scope variabel saat hover.
- **Layout fleksibel:** response di bawah atau di samping (toggle), semua panel bisa di-resize atau di-collapse, mode fokus.
- **Empty state yang mengajarkan:** contoh "Send your first request" dengan koleksi demo publik.
- **Aksesibilitas:** navigasi keyboard penuh, kontras AA, label ARIA pada tree dan tabel.
- **Mobile:** read-only + kirim request sederhana. Tablet: dua panel.

### 9.3 Shortcut default

| Aksi | Windows/Linux | macOS |
|---|---|---|
| Request baru / tab baru | Ctrl+T | ⌘T |
| Send | Ctrl+Enter | ⌘↵ |
| Save | Ctrl+S | ⌘S |
| Search | Ctrl+K | ⌘K |
| Command palette | Ctrl+Shift+P | ⌘⇧P |
| Console | Ctrl+Alt+C | ⌘⌥C |
| Toggle sidebar | Ctrl+\ | ⌘\ |
| Tutup tab | Ctrl+W | ⌘W |
| Beautify body | Ctrl+B | ⌘B |
| Import | Ctrl+O | ⌘O |

---

## 10. API backend

REST (atau tRPC), prefix `/api/v1`, auth via session cookie (web) atau `X-API-Key` (publik/CLI).

```
Auth & user
  POST   /auth/signup | /auth/login | /auth/logout | /auth/oauth/:provider
  GET    /me                         PATCH /me

Org/Team/Workspace
  GET|POST          /workspaces
  GET|PATCH|DELETE  /workspaces/:id
  GET|POST|DELETE   /workspaces/:id/members

Collections
  GET|POST          /workspaces/:wid/collections
  GET|PATCH|DELETE  /collections/:id
  POST              /collections/:id/fork
  GET               /collections/:id/export?format=packetman|postman21|openapi|bruno
  POST              /workspaces/:wid/import          (multipart/url/raw; deteksi format otomatis)
  GET|POST          /collections/:id/folders  ·  /collections/:id/requests
  PATCH|DELETE      /folders/:id  ·  /requests/:id
  POST              /requests/:id/examples
  POST              /collections/:id/reorder         (batch sort_index)

Environment & variabel
  GET|POST /workspaces/:wid/environments  ·  PATCH|DELETE /environments/:id
  GET|PUT  /workspaces/:wid/globals

Sync & realtime
  POST /sync/push     GET /sync/pull?since=     WS /realtime?workspace=:id  (Yjs + presence)

Eksekusi (Cloud Relay)
  POST /relay/http                       → response + timings
  WS   /relay/stream                     (ws/sio/sse/grpc/mqtt, protokol JSON-RPC seperti §5.2)

Runner, monitor, mock
  POST /collections/:id/runs   GET /runs/:id   GET /runs/:id/results   GET /runs/:id/report?format=junit|html
  GET|POST /monitors   PATCH|DELETE /monitors/:id   GET /monitors/:id/history
  GET|POST /mocks      PATCH|DELETE /mocks/:id      GET /mocks/:id/logs
  ANY  https://{sub}.mock.packetman.dev/*            (mock runtime)

Kolaborasi
  GET|POST /comments?entity=   PATCH /comments/:id
  GET|POST /pull-requests   POST /pull-requests/:id/merge|approve|decline
  GET /collections/:id/changelog   POST /collections/:id/restore

Docs & API design
  POST /collections/:id/publish   GET /public/docs/:slug
  GET|POST /apis  ·  /apis/:id/versions  ·  POST /apis/:id/lint

AI
  POST /ai/chat (stream)   POST /ai/generate-tests   POST /ai/explain-response
```

---

## 11. Keamanan & privasi data

### 11.1 Klasifikasi data: apa yang keluar dari perangkatmu

| Data | Default | Kapan keluar | Ke mana |
|---|---|---|---|
| Request yang kamu kirim (URL, header, body) | Lokal | Saat kamu menekan Send | **Hanya ke server tujuan**, lewat Direct/Extension/Agent. Lewat Relay hanya jika diizinkan per domain. |
| Koleksi, folder, environment, script | Lokal (IndexedDB) | Saat sync tim aktif | Server Packetman dalam bentuk **ciphertext E2E** |
| Variabel `secret` dan current value | Lokal | **Tidak pernah** | — |
| Vault | Lokal, terenkripsi | Saat sync vault aktif | Server dalam bentuk ciphertext E2E |
| History & response | Lokal | **Tidak pernah** (kecuali kamu share) | — |
| Koleksi "Share to Cloud" (mock/monitor/docs) | Mati | Saat kamu share koleksi tersebut | Server Packetman, plaintext, tanpa secret |
| Prompt Packetbot | Mati | Saat AI aktif dan kamu menekan Kirim | Model lokal / provider pilihanmu, sudah di-redact |
| Telemetri | **Mati** | Saat kamu opt-in | Event anonim (nama fitur, durasi, versi app). Tanpa URL, header, body, maupun nama variabel. |
| Crash report | Mati | Opt-in per crash (preview dulu) | Stack trace yang sudah di-scrub |

### 11.2 Aturan "tidak menyentuh tool lain"

Pelajaran langsung dari kasus Postman 12.33.4 (§0), berlaku untuk **semua** komponen Packetman (web, agent, CLI, extension):

- Tidak menulis, mengubah, atau menghapus file di luar direktori data Packetman sendiri. Ini mencakup `~/.codex/`, `~/.claude/`, `.cursor/`, `.vscode/`, shell profile (`.bashrc`, `.zshrc`, PowerShell profile), `PATH`, dan registry.
- Tidak menyetujui prompt keamanan atau trust milik aplikasi lain atas nama user.
- Installer agent hanya memasang dirinya ke direktori yang dipilih user. Penambahan ke `PATH` dan autostart masing-masing berupa checkbox yang default-nya **tidak dicentang**.
- Update hanya mengganti binary Packetman. **Update tidak boleh menambah integrasi, plugin, izin, atau koneksi baru.** Fitur baru yang menyentuh data hadir dalam keadaan OFF, dengan changelog yang menjelaskan datanya ke mana.
- **Ditegakkan oleh tes CI:** installer dan updater dijalankan di sandbox (container dengan home dir palsu), lalu filesystem di-diff. Build gagal kalau ada file yang berubah di luar direktori yang diizinkan.

### 11.3 Egress Monitor (fitur pembeda)

Panel transparansi yang mencatat **setiap koneksi keluar yang dibuat oleh Packetman sendiri**, terpisah dari request yang kamu kirim:

```
🛡 Egress Monitor                                        [Export JSON] [Policy]
──────────────────────────────────────────────────────────────────────────────
Waktu     Komponen   Tujuan                     Tujuan koneksi   Ukuran  Isi
10:02:11  sync       api.packetman.dev          sync push        3.1 KB  ciphertext ✓
10:02:40  ai         api.anthropic.com          Packetbot        1.2 KB  redacted (3)
10:05:00  update     releases.packetman.dev     cek versi        210 B   versi app
──────────────────────────────────────────────────────────────────────────────
Request kamu sendiri tercatat terpisah di History & Console.
```

- **Web:** semua `fetch`/WebSocket internal aplikasi lewat satu modul `egress.ts` yang mencatat dan menegakkan policy. CSP `connect-src` membatasi domain internal, jadi koneksi yang tidak terdaftar ditolak oleh browser. Request user dikirim lewat agent/extension atau sandbox terpisah dengan kebijakan tersendiri.
- **Agent/CLI:** semua koneksi keluar lewat satu HTTP client yang menulis ke log egress lokal, yang juga bisa dilihat di UI. Perintah `packetman doctor --privacy` mencetak semua koneksi, konfigurasi, dan file yang dimiliki Packetman.
- **Policy:** user atau admin bisa memblokir kategori tertentu (mis. "update check: off", "AI: block").
- **Status bar:** `🛡 Egress: 0 bg` menunjukkan jumlah koneksi latar belakang sesi ini.

### 11.4 Kepatuhan

- **UU PDP (UU No. 27 Tahun 2022)** dan GDPR: data minimization, pilihan region (Indonesia/Singapura), DPA untuk paket tim, hak hapus data (hapus akun = hapus semua ciphertext + kunci), serta kewajiban notifikasi kebocoran.
- Kebijakan privasi yang mudah dibaca, ditambah **Privacy Manifest** yang machine-readable dan menjadi bagian dari repo. Tes CI memastikan manifest sesuai dengan daftar domain di `egress.ts`.
- Rencana audit keamanan pihak ketiga dan program bug bounty setelah v1.

### 11.5 Ancaman & mitigasi

| Ancaman | Mitigasi |
|---|---|
| **SSRF lewat Cloud Relay** (pengguna menyuruh relay mengakses `169.254.169.254`, `10.x`, `localhost` milik server) | Resolve DNS lalu blokir IP privat, loopback, link-local, metadata cloud, dan IPv6 ULA. Cek ulang setelah redirect (cegah DNS rebinding). Relay jalan di jaringan terisolasi tanpa akses ke VPC internal. Target internal hanya lewat Desktop Agent. |
| Penyalahgunaan relay (DDoS, scanning) | Rate limit per user/IP, kuota bandwidth, batas ukuran body (mis. 50 MB), timeout, blok port non-HTTP di relay publik, deteksi pola scanning. |
| Kebocoran secret | Tipe `secret` disembunyikan di UI dan tidak ikut ekspor/sync. Current value lokal saja. Vault dienkripsi E2E (AES-256-GCM, kunci dari passphrase via Argon2id, server hanya menyimpan ciphertext). **Secret scanner lokal** berjalan sebelum sync, ekspor, share, dan "Share to Cloud": kalau menemukan pola Stripe `sk_live_`, Midtrans Server Key, AWS key, JWT, atau private key di *initial value* atau body, Packetman menampilkan peringatan dan menawarkan "jadikan secret". |
| Server Packetman diretas atau dipaksa menyerahkan data | Zero-knowledge: server hanya punya ciphertext koleksi dan vault. Kunci tidak pernah ada di server. |
| Supply chain (dependensi atau update berbahaya) | Lockfile + audit dependensi di CI, build reproducible, rilis ditandatangani (Sigstore/cosign), SBOM dipublikasikan, auto-update bisa dimatikan. |
| Fitur AI membocorkan data | Default OFF, redaksi otomatis, preview sebelum kirim, BYO key langsung ke provider, model lokal, audit log (§4.18). |
| Script berbahaya di koleksi impor | Sandbox QuickJS tanpa akses host. Peringatan saat pertama kali menjalankan script dari koleksi pihak lain. Batas waktu & memori. |
| Agent lokal diakses situs jahat | Agent hanya bind ke `127.0.0.1`, cek header `Origin` (allowlist domain Packetman + self-host yang terdaftar), wajib token pairing yang ditampilkan di UI agent, rotasi token. |
| XSS lewat response preview / visualizer | Render di `iframe sandbox` tanpa `allow-same-origin`, CSP ketat, origin terpisah (`usercontent.packetman.dev`). |
| Akses data lintas tenant | Row-level authorization di setiap query (cek `workspace_id` + peran). Tes otomatis untuk isolasi tenant. |
| Akun | 2FA (TOTP/WebAuthn), SSO, kebijakan sesi, audit log. |

---

## 12. Struktur monorepo

```
packetman/
├── apps/
│   ├── web/              # Next.js: workspace app + docs publik + landing
│   ├── api/              # Hono/Fastify: REST/tRPC, sync, realtime (Hocuspocus)
│   ├── relay/            # Go: cloud executor (HTTP/WS/SIO/SSE/gRPC/MQTT)
│   ├── agent/            # Go: desktop agent (pakai paket executor yang sama dengan relay)
│   ├── worker/           # Node: runner terjadwal, monitor, perf test (BullMQ)
│   ├── mock/             # Node/Go: mock server runtime
│   ├── extension/        # Browser extension MV3 (Interceptor)
│   └── cli/              # `packetman run …` (setara Newman)
├── packages/
│   ├── core/             # model koleksi, variable resolver, auth signers, builder (isomorphic TS)
│   ├── runtime/          # pipeline eksekusi + sandbox QuickJS + API pm/pk
│   ├── importers/        # postman, openapi, insomnia, bruno, har, curl, graphql, wsdl…
│   ├── codegen/          # generator snippet multi-bahasa
│   ├── protocol/         # tipe JSON-RPC web ↔ agent/relay
│   ├── ui/               # komponen shadcn + editor Monaco + tree
│   ├── db/               # skema Drizzle + migrasi
│   └── config/           # eslint, tsconfig, tailwind preset
├── go/
│   └── executor/         # modul Go yang dipakai bersama relay & agent
├── docs/                 # dokumen ini, ADR
├── docker-compose.yml    # self-host: web, api, relay, worker, mock, postgres, redis, minio
└── turbo.json            # Turborepo + pnpm workspaces
```

---

## 13. Roadmap

Estimasi untuk tim 2-3 developer full-time.

### Fase 0: Fondasi (2 minggu)
Monorepo, CI, desain sistem UI, skema DB, auth dasar, `packages/core` (model + resolver), uji kompatibilitas impor Postman v2.1, **modul `egress.ts` + tes egress CI** (mode tanpa akun = 0 koneksi ke server Packetman), dan **tes sandbox installer** (diff filesystem). Privasi dibangun dari hari pertama, bukan ditambal belakangan.

### Fase 1: MVP "Postman tanpa rasa was-was" (6-8 minggu) → **P0**
- Request builder HTTP lengkap (params, headers, semua mode body)
- Auth: API Key, Bearer, Basic, OAuth2 (Auth Code + PKCE, Client Credentials)
- Response viewer (pretty/raw/preview, headers, cookies)
- Collections, folders, tabs, history, environments & variabel (scope penuh, tipe `secret`)
- Pre-request/post-response script (sandbox + `pm` inti + chai)
- Executor: Direct + **Browser Extension** (jalur lokal tanpa install app). Cloud Relay opt-in dengan anti-SSRF dan tanpa log payload.
- **Migration Assistant Postman** (impor + secret scrub + laporan kompatibilitas script)
- Impor/ekspor Postman v2.1, cURL, OpenAPI 3; code gen 5 bahasa
- Collection Runner dasar + data file CSV/JSON
- Console, cookie manager, tema light/dark
- Local-first (IndexedDB), bisa dipakai tanpa akun
- **Egress Monitor** + Privacy Manifest publik + secret scanner lokal
- Rilis open-source core + extension

### Fase 2: v1.0 "untuk tim, tetap zero-knowledge" (8-10 minggu) → **P1**
- Desktop Agent (localhost, mTLS, proxy) dengan installer tanpa sentuhan ke tool lain
- **Sync tim E2E** (manajemen kunci, recovery kit), workspace tim, RBAC, undangan, komentar, version history, share link
- GraphQL, WebSocket, Socket.IO, SSE
- "Share to Cloud" per koleksi → mock server cloud, monitor dasar, scheduled run
- CLI `packetman` + reporter JUnit/HTML + template GitHub Actions
- Docs publik + "Run in Packetman"
- **Packetbot opt-in**: model lokal (WebLLM/Ollama) + BYO key langsung ke provider, redaksi otomatis, preview sebelum kirim
- Format Git-native + sync GitHub
- Auth tambahan (Digest, OAuth1, AWS v4, JWT), dynamic variables, visualizer
- Pilihan region relay (Indonesia/Singapura), dokumen kepatuhan UU PDP

### Fase 3: v2 "platform API" (berkelanjutan) → **P2**
- gRPC & MQTT (via agent/relay), SOAP/WSDL
- Edit real-time (Yjs), fork & pull request
- API design: spec editor, linting/governance, versioning, contract testing
- Performance testing, monitor multi-region
- Flows (visual workflow), capture traffic via proxy
- Vault + integrasi secret manager, MCP (client & ekspor sebagai server)
- Enterprise: SSO/SCIM, audit log, self-host Helm chart

### Metrik keberhasilan
- Time-to-first-request < 30 detik untuk pengguna baru (tanpa login)
- Mode tanpa akun: **0** koneksi ke domain Packetman (tes CI wajib lulus di setiap rilis)
- 0 file berubah di luar direktori Packetman saat install/update (tes CI)
- ≥ 30% pengguna baru berasal dari Migration Assistant Postman dalam 6 bulan pertama
- Impor koleksi Postman nyata: ≥ 98% request & script jalan tanpa modifikasi
- p95 overhead relay < 80 ms; app bisa dipakai interaktif < 2 detik setelah dibuka
- Retensi minggu ke-4 ≥ 35%

---

## 14. Diferensiasi & model bisnis

### Kenapa orang pindah ke Packetman

| Keluhan umum terhadap Postman | Jawaban Packetman |
|---|---|
| Update memasang plugin AI ke tool lain tanpa izin (kasus 12.33.4) | Aturan "tidak menyentuh tool lain" ditegakkan tes CI. Update tidak pernah menambah integrasi. |
| Tidak tahu data apa yang keluar dari mesin | Egress Monitor + Privacy Manifest + kode open-source |
| Khawatir token dan secret payment gateway ikut terbaca AI | AI default OFF, redaksi otomatis, preview, model lokal atau BYO key |
| Wajib login / data dipaksa ke cloud | Mode lokal tanpa akun. Sync tim E2E zero-knowledge. Self-host. |
| Aplikasi desktop Electron berat | Web-first; agent opsional ±10 MB |
| Koleksi tidak enak di Git | Format YAML per request, diff-friendly |
| Batas fitur di paket gratis (runner, kolaborasi) | Runner lokal tanpa batas di paket gratis |
| Vendor lock-in | Impor/ekspor lossless ke Postman, Bruno, Insomnia, OpenAPI |

**Kenapa tidak cukup pakai Bruno saja?** Bruno menjawab soal privasi, tapi tetap aplikasi desktop dan kolaborasinya bergantung pada Git. Packetman menargetkan celah di antaranya: **privasi selevel Bruno, kolaborasi real-time selevel Postman, dan tanpa install.** Ini cocok untuk tim yang memakai laptop kantor terkunci, Chromebook, atau sekadar ingin buka tab browser lalu langsung kerja.

**Pesan marketing (fokus ke janji sendiri, bukan menyerang kompetitor):**
- *"Token kamu nggak ke mana-mana. Cek sendiri di Egress Monitor."*
- *"AI-nya mati sampai kamu yang nyalain."*
- *"Pindah dari Postman 2 menit, secret otomatis diamankan."*

### Paket harga (usulan)

| Paket | Harga | Isi |
|---|---|---|
| **Free** | Rp0 | Semua fitur lokal, runner lokal tanpa batas, 3 kolaborator, 1.000 call relay/bulan, 1 mock (1.000 call), docs publik |
| **Pro** | ±US$8/user/bulan | Relay tanpa batas wajar, mock & monitor lebih banyak, Packetbot, version history 1 tahun |
| **Team** | ±US$16/user/bulan | RBAC, fork/PR, real-time collab, scheduled run, integrasi |
| **Enterprise** | Custom | SSO/SCIM, audit log, governance, self-host, SLA |

Opsi lain: rilis core + agent + CLI sebagai **open-source** (MIT/Apache-2.0), lalu monetisasi lewat cloud (relay, mock, monitor, kolaborasi), mengikuti pola Hoppscotch/Bruno.

---

## 15. Batasan legal

- **Jangan** memakai nama, logo, ikon, warna merek, teks UI persis, ilustrasi, atau aset Postman. Nama "Packetman" sudah berbeda, tapi pertimbangkan cek merek dagang sebelum rilis karena akhiran "-man" mirip.
- **Jangan menyalin kode** dari `app.asar`. Reverse engineering di dokumen ini hanya untuk memetakan **fitur dan arsitektur tingkat tinggi**. Semua implementasi Packetman harus ditulis sendiri.
- **Kompatibilitas format itu sah**: skema Postman Collection dipublikasikan terbuka, dan meniru nama API `pm.*` untuk interoperabilitas umumnya bisa diterima. Implementasinya tetap harus orisinal.
- Beberapa library Postman rilis open-source di GitHub (mis. `postman-collection`, `postman-code-generators`, `openapi-to-postman`, `newman`). **Cek lisensi tiap repo** (banyak yang Apache-2.0) sebelum memakai, dan ikuti kewajiban atribusi/NOTICE.
- Baca EULA/ToS Postman soal reverse engineering sebelum melakukan analisis lebih dalam. Analisis di sini hanya inventaris statis untuk riset fitur.
- **Hati-hati di materi marketing.** Jangan menyatakan "Postman mencuri/mengirim token & payload kamu ke cloud". Klaim itu **tidak terbukti** menurut sumber yang ditelusuri (§0) dan berisiko gugatan pencemaran nama baik (termasuk lewat UU ITE). Yang aman disebut adalah fakta yang terdokumentasi: auto-install plugin ke Codex/Claude Code di versi 12.33.4, dan Postman sudah menyatakan akan me-revert perubahan itu. Lebih baik lagi, fokuskan marketing pada jaminan Packetman sendiri yang bisa dibuktikan (Egress Monitor, open-source, tes CI).

---

## 16. Lampiran: ledger evidence

| Klaim | Tipe | Sumber |
|---|---|---|
| Artefak: Postman 11.86.1, `app.asar`, SHA-256 `e140a9a5fe44205575d7cb073e373174634b216a14579e6bdef6240727f6df94`, 276 file relevan | Observed | REA `analyze_javascript_application` → `ev_1d481e139bd656df4a331e98b6e3c73e6f1a108bdcf6a850c2fdf2767011d424` |
| Daftar 232 modul JS (nama file di §2.1, §2.4, §2.5) | Observed (nama file) | REA module page → `ev_1ff77bbf75b61a0faf2b6787f48825f89f97b8e09299f8c503ad14d317d4e099` |
| Daftar dependensi (`package.json`) & halaman HTML | Observed | Pembacaan header ASAR read-only (script lokal), tanpa menjalankan kode target |
| Fungsi subsistem (mock, proxy, perf test, AI agent, terminal, dll.) | **Inferred** dari nama file/dependensi | Belum ditelusuri isi kodenya |
| Relasi antar modul, alur IPC, endpoint cloud | **Unknown** | 275 file di luar cakupan analisis semantik; analisis graph partial |
| Fitur cloud (monitor, tim, governance, Flows, docs publik) | Pengetahuan domain | Tidak terlihat di artefak desktop |
| Diff `package.json` 11.85.1 → 11.86.1: hanya `@postman/runtime` ^0.18.3 → ^0.20.1. Dependensi AI/MCP sudah ada di 11.85.1. | Observed | Pembacaan header ASAR kedua versi (read-only) |
| Postman 12.33.4 memasang plugin ke Codex & Claude Code saat auto-upgrade, menulis trust record hook, mengonfigurasi MCP remote `mcp.postman.com` (gagal auth), dan menaruh CLI di `~/.local/bin`. Postman menyatakan "reverting this change". | Laporan pihak ketiga (primer) | GitHub `postmanlabs/postman-app-support#14370`; diliput aiweekly.co, byteiota.com, daily.dev, memeburn.com |
| Plugin mengirim payload/token/API key ke cloud Postman | **Tidak terbukti** | Pelapor issue tidak mengklaim eksfiltrasi. Liputan tidak menyertakan bukti transmisi. |
| Perilaku installer 12.33.4 di mesin ini | **Unknown** | Versi tersebut tidak terpasang secara lokal (yang ada 11.85.1/11.86.1, diinstall 1 Maret 2026) |

**Langkah lanjutan jika butuh detail lebih** (opsional): analisis semantik terarah pada `js/scratchpad/postman-runtime.js`, `ExecutionProcess.js`, `mock-server-runtime/http-server-worker.js`, dan `perftestExecute.js` untuk memetakan pipeline eksekusi & mock secara lebih presisi. Tetap sebatas perilaku, bukan menyalin kode.
