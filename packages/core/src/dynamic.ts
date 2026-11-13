/** Dynamic variables, e.g. {{$guid}} and {{$randomEmail}}. Generated locally, never fetched. */

const FIRST = ["Budi", "Siti", "Agus", "Dewi", "Rina", "Andi", "Maya", "Joko", "Putri", "Rizky", "Alex", "Sam", "Jordan", "Taylor", "Casey"];
const LAST = ["Santoso", "Wijaya", "Pratama", "Lestari", "Saputra", "Hidayat", "Kusuma", "Nugroho", "Rahman", "Smith", "Lee", "Garcia"];
const CITIES = ["Jakarta", "Bandung", "Surabaya", "Yogyakarta", "Medan", "Makassar", "Denpasar", "Singapore", "Tokyo", "Berlin"];
const COUNTRIES = ["Indonesia", "Singapore", "Malaysia", "Japan", "Germany", "Brazil", "Canada", "Australia"];
const WORDS = ["packet", "signal", "socket", "vector", "lumen", "orbit", "cobalt", "ember", "harbor", "quartz", "relay", "tensor"];
const COMPANIES = ["Nusantara Labs", "Garuda Systems", "Selaras Tech", "Kopi Digital", "Arunika Data", "Benua Cloud"];
const DOMAINS = ["example.com", "example.org", "example.net"];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const generators: Record<string, () => string> = {
  $guid: uuid,
  $randomUUID: uuid,
  $timestamp: () => String(Math.floor(Date.now() / 1000)),
  $isoTimestamp: () => new Date().toISOString(),
  $randomInt: () => String(randInt(0, 1000)),
  $randomBoolean: () => String(Math.random() < 0.5),
  $randomFirstName: () => pick(FIRST),
  $randomLastName: () => pick(LAST),
  $randomFullName: () => `${pick(FIRST)} ${pick(LAST)}`,
  $randomUserName: () => `${pick(FIRST).toLowerCase()}.${pick(LAST).toLowerCase()}${randInt(1, 99)}`,
  $randomEmail: () => `${pick(FIRST).toLowerCase()}.${pick(LAST).toLowerCase()}${randInt(1, 999)}@${pick(DOMAINS)}`,
  $randomPhoneNumber: () => `+62 8${randInt(11, 99)}-${randInt(1000, 9999)}-${randInt(1000, 9999)}`,
  $randomCity: () => pick(CITIES),
  $randomCountry: () => pick(COUNTRIES),
  $randomWord: () => pick(WORDS),
  $randomWords: () => Array.from({ length: 3 }, () => pick(WORDS)).join(" "),
  $randomCompanyName: () => pick(COMPANIES),
  $randomIP: () => `${randInt(1, 223)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`,
  $randomUrl: () => `https://${pick(WORDS)}.${pick(DOMAINS)}`,
  $randomHexColor: () => "#" + randInt(0, 0xffffff).toString(16).padStart(6, "0"),
  $randomAlphaNumeric: () => Math.random().toString(36).charAt(2) || "a",
  $randomPrice: () => (randInt(100, 100000) / 100).toFixed(2),
};

export const DYNAMIC_VARIABLE_NAMES = Object.keys(generators);

export function isDynamicVariable(name: string): boolean {
  return name in generators;
}

export function generateDynamic(name: string): string | undefined {
  const gen = generators[name];
  return gen ? gen() : undefined;
}
