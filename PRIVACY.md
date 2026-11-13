# Privacy Manifest Packetman

Dokumen ini menjelaskan data apa yang keluar dari perangkatmu saat memakai Packetman v0.1.0, dan ke mana. Isinya harus selalu sesuai dengan kode di [`apps/web/src/lib/egress.ts`](apps/web/src/lib/egress.ts) dan [`apps/web/src/lib/executors.ts`](apps/web/src/lib/executors.ts).

## Ringkasan

- Koleksi, environment, variabel, riwayat, dan pengaturan disimpan **hanya di IndexedDB browsermu**. Versi ini tidak punya sync cloud, akun, atau database server.
- Packetman **tidak membuat koneksi latar belakang**: tidak ada telemetri, analitik, crash report, atau pengecekan update.
- Packetman **tidak pernah mengubah file atau konfigurasi aplikasi lain** (Claude Code, Codex, IDE, shell, PATH).
- **Tidak ada fitur AI** di versi ini.

## Data yang keluar dari perangkat

| Data | Kapan | Ke mana |
|---|---|---|
| Request yang kamu kirim (URL, header, body) | Saat kamu menekan Kirim atau menjalankan Runner | Langsung ke server tujuan, lewat extension atau browser. Lewat **Packetman Relay** hanya jika kamu mengizinkannya untuk domain itu. |
| Request token OAuth 2.0 | Saat kamu menekan "Ambil token baru"/"Refresh" | Ke token endpoint yang kamu isi, lewat jalur yang sama seperti di atas |
| Login OAuth 2.0 | Saat Authorization Code | Browser membuka halaman login provider-mu. Code dikembalikan ke halaman `/oauth/callback` di origin yang sama dan tidak dikirim ke tempat lain. |

Semua koneksi yang dibuat Packetman sendiri (saat ini hanya relay) tercatat di **Egress Monitor**.

## Packetman Relay

- Hanya dipakai jika browser menolak request (biasanya karena CORS) **dan** kamu memilih "Kirim sekali lewat relay" atau "Selalu izinkan untuk domain ini". Izin per domain bisa dicabut di Egress Monitor.
- Relay **tidak menyimpan dan tidak mencatat** URL, header, body, maupun response. Yang ada hanya penghitung rate limit per IP di memori.
- Relay tidak bisa mengakses alamat lokal atau privat. Untuk target lokal, pakai Packetman Interceptor.
- Operator self-host bisa mematikan relay dengan `PACKETMAN_RELAY_ENABLED=false`.

## Penyimpanan lokal

| Data | Lokasi | Ikut ekspor? |
|---|---|---|
| Nilai awal variabel bertipe default | IndexedDB | Ya |
| Nilai variabel bertipe secret | IndexedDB | **Tidak** (diekspor kosong) |
| Nilai saat ini (current value) | IndexedDB | **Tidak** |
| Access/refresh token OAuth 2.0 | IndexedDB | **Tidak** |
| Riwayat request (tanpa body response) | IndexedDB | Tidak |

Menghapus data situs Packetman di browser menghapus semuanya.

## Build & infrastruktur

- Font di-bundle saat build dan disajikan dari origin Packetman sendiri. Tidak ada request ke Google Fonts atau CDN saat app dipakai.
- Telemetri Next.js dan Turborepo dimatikan di script build dan di image Docker.
- Content Security Policy membatasi script, style, font, dan frame ke origin Packetman. Pratinjau HTML response dirender di iframe sandbox yang tidak bisa memuat resource luar.
