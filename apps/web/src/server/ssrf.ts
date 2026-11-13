import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * SSRF guard for the cloud relay. The relay must never reach loopback,
 * private networks, link-local ranges or cloud metadata endpoints. Internal
 * targets belong to the Desktop Agent, which runs on the user's own machine.
 *
 * Self-hosters on a trusted network can set PACKETMAN_RELAY_ALLOW_PRIVATE=true.
 */

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

const BLOCKED_V4: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function isBlockedV4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  return BLOCKED_V4.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (ipv4ToInt(base) & mask);
  });
}

function isBlockedV6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return isBlockedV4(mapped[1]!);
  return /^(fc|fd)/.test(lower) || /^fe[89ab]/.test(lower) || lower.startsWith("ff");
}

export function isBlockedAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isBlockedV4(ip);
  if (family === 6) return isBlockedV6(ip);
  return true;
}

export class SsrfError extends Error {}

const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443", "3000", "5000", "8000", "8888", "9000"]);

/** Throws SsrfError when the URL must not be fetched by the relay. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfError("URL tidak valid.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new SsrfError(`Protokol ${url.protocol} tidak didukung relay.`);
  if (url.username || url.password) throw new SsrfError("Kredensial di URL tidak diizinkan lewat relay. Gunakan tab Auth.");
  if (process.env.PACKETMAN_RELAY_ALLOW_PRIVATE === "true") return url;
  if (!ALLOWED_PORTS.has(url.port)) throw new SsrfError(`Port ${url.port} diblokir di relay publik.`);

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host)) {
    throw new SsrfError(`${host} adalah alamat lokal. Gunakan Browser Extension atau Desktop Agent untuk target lokal.`);
  }
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
  if (!addresses.length) throw new SsrfError(`DNS ${host} tidak ditemukan.`);
  for (const a of addresses) {
    if (isBlockedAddress(a.address)) {
      throw new SsrfError(`${host} mengarah ke alamat privat/terlarang (${a.address}). Relay tidak boleh mengaksesnya.`);
    }
  }
  return url;
}
