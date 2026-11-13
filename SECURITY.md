# Kebijakan Keamanan

## Versi yang didukung

| Versi | Didukung |
|---|---|
| 0.1.x | Ya |

## Melaporkan celah keamanan

Jangan laporkan celah keamanan lewat issue publik. Gunakan fitur **Private vulnerability reporting / Security Advisory** di repositori GitHub Packetman, sertakan:

- deskripsi celah dan dampaknya,
- langkah reproduksi atau proof of concept,
- versi/commit yang terdampak.

Area yang paling penting untuk diuji:

- **Relay** (`apps/web/src/app/api/relay`, `apps/web/src/server/ssrf.ts`): SSRF, DNS rebinding, bypass redirect, penyalahgunaan sebagai proxy terbuka.
- **Sandbox script** (`packages/runtime`): keluar dari sandbox QuickJS, akses ke jaringan/DOM/storage host.
- **Extension** (`apps/extension`): pesan dari origin yang tidak sah, kebocoran respons ke halaman lain.
- **Alur OAuth** (`apps/web/src/lib/oauthPopup.ts`, `/oauth/callback`): kebocoran authorization code, CSRF via `state`.
- **Egress**: koneksi keluar yang tidak tercatat di Egress Monitor.

## Catatan deployment

- Jangan aktifkan `PACKETMAN_RELAY_ALLOW_PRIVATE=true` di deployment yang bisa diakses publik.
- Pasang Packetman di belakang HTTPS. Relay membaca `X-Forwarded-For` untuk rate limit, jadi pastikan reverse proxy kamu menimpa header itu.
