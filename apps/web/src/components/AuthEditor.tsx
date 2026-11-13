"use client";

import type { Auth, AuthType } from "@packetman/core";
import { Select, TextInput } from "./ui";

const LABELS: Record<AuthType, string> = {
  inherit: "Ikuti induk",
  none: "Tanpa auth",
  apikey: "API Key",
  bearer: "Bearer token",
  basic: "Basic auth",
};

function defaults(type: AuthType): Auth {
  switch (type) {
    case "inherit":
      return { type };
    case "none":
      return { type };
    case "apikey":
      return { type, key: "X-API-Key", value: "", in: "header" };
    case "bearer":
      return { type, token: "" };
    case "basic":
      return { type, username: "", password: "" };
  }
}

export function AuthEditor({ auth, onChange, allowInherit = true, inheritedFrom }: { auth: Auth; onChange: (a: Auth) => void; allowInherit?: boolean; inheritedFrom?: string }) {
  const types = (Object.keys(LABELS) as AuthType[]).filter((t) => allowInherit || t !== "inherit");
  const field = "grid grid-cols-[140px_minmax(0,420px)] items-center gap-3";
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className={field}>
        <label htmlFor="auth-type" className="text-sm text-muted">
          Tipe
        </label>
        <Select id="auth-type" value={auth.type} onChange={(e) => onChange(defaults(e.target.value as AuthType))}>
          {types.map((t) => (
            <option key={t} value={t}>
              {LABELS[t]}
            </option>
          ))}
        </Select>
      </div>

      {auth.type === "inherit" && <p className="text-sm text-muted">Request ini memakai auth dari {inheritedFrom ?? "folder atau koleksi induk"}.</p>}
      {auth.type === "none" && <p className="text-sm text-muted">Tidak ada header auth yang ditambahkan.</p>}

      {auth.type === "bearer" && (
        <div className={field}>
          <label className="text-sm text-muted">Token</label>
          <TextInput className="font-mono" value={auth.token} placeholder="{{token}}" onChange={(e) => onChange({ ...auth, token: e.target.value })} />
        </div>
      )}

      {auth.type === "basic" && (
        <>
          <div className={field}>
            <label className="text-sm text-muted">Username</label>
            <TextInput className="font-mono" value={auth.username} onChange={(e) => onChange({ ...auth, username: e.target.value })} />
          </div>
          <div className={field}>
            <label className="text-sm text-muted">Password</label>
            <TextInput className="font-mono" type="password" value={auth.password} placeholder="{{password}}" onChange={(e) => onChange({ ...auth, password: e.target.value })} />
          </div>
        </>
      )}

      {auth.type === "apikey" && (
        <>
          <div className={field}>
            <label className="text-sm text-muted">Nama</label>
            <TextInput className="font-mono" value={auth.key} onChange={(e) => onChange({ ...auth, key: e.target.value })} />
          </div>
          <div className={field}>
            <label className="text-sm text-muted">Nilai</label>
            <TextInput className="font-mono" value={auth.value} placeholder="{{apiKey}}" onChange={(e) => onChange({ ...auth, value: e.target.value })} />
          </div>
          <div className={field}>
            <label className="text-sm text-muted">Dikirim lewat</label>
            <Select value={auth.in} onChange={(e) => onChange({ ...auth, in: e.target.value as "header" | "query" })}>
              <option value="header">Header</option>
              <option value="query">Query param</option>
            </Select>
          </div>
        </>
      )}

      {(auth.type === "bearer" || auth.type === "basic" || auth.type === "apikey") && (
        <p className="max-w-xl text-xs text-faint">Simpan rahasia di variabel environment bertipe secret, lalu rujuk dengan {"{{nama}}"}. Nilai secret tidak ikut ekspor.</p>
      )}
    </div>
  );
}
