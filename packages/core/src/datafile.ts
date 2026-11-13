/**
 * Iteration data files for the Collection Runner (CSV or JSON), parsed locally.
 * Each row becomes the "data" variable scope for one iteration.
 */

export type DataRow = Record<string, string>;

export interface DataFile {
  rows: DataRow[];
  columns: string[];
  format: "csv" | "json";
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return "";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

/** RFC 4180-style CSV: quoted fields, escaped quotes (""), commas/newlines inside quotes, CRLF. */
export function parseCsv(text: string): DataFile {
  const src = text.replace(/^﻿/, "");
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === "") inQuotes = true;
    else if (c === ",") {
      record.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else field += c;
  }
  if (inQuotes) throw new Error("CSV tidak valid: ada tanda kutip yang tidak ditutup.");
  if (field !== "" || record.length) {
    record.push(field);
    records.push(record);
  }
  const nonEmpty = records.filter((r) => !(r.length === 1 && r[0] === ""));
  if (!nonEmpty.length) throw new Error("File CSV kosong.");
  const columns = nonEmpty[0]!.map((c) => c.trim());
  if (columns.some((c) => !c)) throw new Error("Baris pertama CSV harus berisi nama kolom.");
  const rows = nonEmpty.slice(1).map((r) => Object.fromEntries(columns.map((col, i) => [col, r[i] ?? ""])));
  return { rows, columns, format: "csv" };
}

export function parseJsonData(text: string): DataFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("JSON tidak valid.");
  }
  if (!Array.isArray(data) || !data.every((r) => r && typeof r === "object" && !Array.isArray(r))) {
    throw new Error("File data JSON harus berupa array objek, mis. [{\"email\": \"a@b.c\"}].");
  }
  const columns = [...new Set((data as Record<string, unknown>[]).flatMap((r) => Object.keys(r)))];
  const rows = (data as Record<string, unknown>[]).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, stringify(v)])));
  return { rows, columns, format: "json" };
}

export function parseDataFile(text: string, filename = ""): DataFile {
  const trimmed = text.trimStart();
  if (/\.json$/i.test(filename) || trimmed.startsWith("[")) return parseJsonData(text);
  return parseCsv(text);
}
