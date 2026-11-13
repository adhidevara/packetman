"use client";

import type { Collection, Environment, ResolvedRequest, ResponseData } from "@packetman/core";
import Dexie, { type Table } from "dexie";

/**
 * Local-first storage. Everything lives in this browser's IndexedDB; nothing
 * here is sent anywhere. Sync (E2E encrypted) is a later milestone.
 */

export interface HistoryEntry {
  id: string;
  at: number;
  name: string;
  method: string;
  url: string;
  status?: number;
  timeMs?: number;
  executor?: string;
  error?: string;
  /** Snapshot of the editable request so it can be reopened. Never includes the response body. */
  request: unknown;
  resolved?: Pick<ResolvedRequest, "method" | "url">;
}

export interface SettingRow {
  key: string;
  value: unknown;
}

class PacketmanDB extends Dexie {
  collections!: Table<Collection, string>;
  environments!: Table<Environment, string>;
  history!: Table<HistoryEntry, string>;
  settings!: Table<SettingRow, string>;

  constructor() {
    super("packetman");
    this.version(1).stores({
      collections: "id, name, updatedAt",
      environments: "id, name, updatedAt",
      history: "id, at",
      settings: "key",
    });
  }
}

let instance: PacketmanDB | undefined;
export function db(): PacketmanDB {
  instance ??= new PacketmanDB();
  return instance;
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const row = await db().settings.get(key);
    return row ? (row.value as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  try {
    await db().settings.put({ key, value });
  } catch {
    /* storage may be unavailable (private mode); the app keeps working in memory */
  }
}

export type { ResponseData };
