import type { Metadata } from "next";
import Link from "next/link";
import { PACKETMAN_VERSION } from "@/lib/version";

export const metadata: Metadata = {
  title: "Privasi · Packetman",
  description: "Data apa yang keluar dari perangkatmu saat memakai Packetman, dan ke mana.",
};

const ROWS: [string, string, string][] = [
  ["Request yang kamu kirim", "Saat menekan Kirim atau menjalankan Runner", "Langsung ke server tujuan lewat extension atau browser. Lewat relay hanya dengan izinmu per domain."],
  ["Request token OAuth 2.0", "Saat menekan Ambil token / Refresh", "Ke token endpoint yang kamu isi, lewat jalur yang sama."],
  ["Koleksi, environment, riwayat", "Tidak pernah", "Tersimpan di IndexedDB browser ini saja."],
  ["Nilai secret, nilai saat ini, token OAuth", "Tidak pernah", "Tersimpan lokal dan tidak ikut ekspor."],
  ["Telemetri, analitik, crash report", "Tidak ada", "Tidak dikumpulkan sama sekali."],
];

export default function PrivacyPage() {
  return (
    <main className="h-full overflow-auto">
      <article className="mx-auto max-w-3xl px-6 py-12">
        <p className="mb-8 flex items-center gap-2 text-sm text-muted">
          <span className="seal" aria-hidden />
          <Link href="/" className="font-bold text-text hover:underline">
            packetman
          </Link>
          <span>v{PACKETMAN_VERSION}</span>
        </p>
        <h1 className="text-3xl font-bold tracking-tight">Token kamu nggak ke mana-mana.</h1>
        <p className="mt-3 max-w-[65ch] text-base text-muted">
          Packetman adalah API client yang jalan di browsermu. Data request, token, dan payload tetap di perangkatmu. Tidak ada koneksi latar belakang, tidak ada plugin yang memasang dirinya ke aplikasi lain, dan versi ini tidak punya fitur AI.
        </p>

        <h2 className="mt-10 mb-3 text-lg font-semibold">Apa yang keluar dari perangkatmu</h2>
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-raised text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Kapan keluar</th>
                <th className="px-3 py-2 font-medium">Ke mana</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([data, when, where]) => (
                <tr key={data} className="border-t border-line align-top">
                  <td className="px-3 py-2 font-medium">{data}</td>
                  <td className="px-3 py-2 text-muted">{when}</td>
                  <td className="px-3 py-2 text-muted">{where}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="mt-10 mb-3 text-lg font-semibold">Relay hanya dengan izinmu</h2>
        <p className="max-w-[65ch] text-sm leading-relaxed text-muted">
          Kalau server tujuan menolak request dari browser (biasanya karena CORS), Packetman bertanya dulu sebelum memakai relay. Relay tidak menyimpan atau mencatat URL, header, body, maupun response, dan tidak bisa mengakses alamat lokal atau privat. Setiap pemakaian relay tercatat di Egress Monitor (klik indikator segel di status bar), dan izin per domain bisa dicabut kapan saja.
        </p>

        <h2 className="mt-10 mb-3 text-lg font-semibold">Bisa dicek sendiri</h2>
        <ul className="max-w-[65ch] list-disc space-y-1.5 pl-5 text-sm text-muted">
          <li>Egress Monitor mencatat setiap koneksi yang dibuat Packetman sendiri.</li>
          <li>Script koleksi berjalan di sandbox QuickJS tanpa akses jaringan, DOM, atau penyimpanan.</li>
          <li>Content Security Policy membatasi script, font, dan frame ke origin Packetman.</li>
          <li>Kode sumber, termasuk aturan lint yang melarang koneksi keluar di luar modul egress, bisa diaudit di repositori.</li>
        </ul>

        <p className="mt-12 text-sm">
          <Link href="/" className="text-info hover:underline">
            Kembali ke workspace
          </Link>
        </p>
      </article>
    </main>
  );
}
