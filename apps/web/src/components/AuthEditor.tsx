"use client";

import { defaultOAuth2, isTokenExpired, type Auth, type AuthType, type OAuth2Auth } from "@packetman/core";
import { Check, Copy, KeyRound, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useWorkspace } from "@/store/workspace";
import { Button, IconButton, Select, TextInput } from "./ui";

const LABELS: Record<AuthType, string> = {
  inherit: "Ikuti induk",
  none: "Tanpa auth",
  apikey: "API Key",
  bearer: "Bearer token",
  basic: "Basic auth",
  oauth2: "OAuth 2.0",
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
    case "oauth2":
      return defaultOAuth2();
  }
}

const field = "grid grid-cols-[140px_minmax(0,420px)] items-center gap-3";

export function AuthEditor({
  auth,
  onChange,
  allowInherit = true,
  inheritedFrom,
  collectionId,
}: {
  auth: Auth;
  onChange: (a: Auth) => void;
  allowInherit?: boolean;
  inheritedFrom?: string;
  collectionId: string | null;
}) {
  const types = (Object.keys(LABELS) as AuthType[]).filter((t) => allowInherit || t !== "inherit");
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

      {auth.type === "oauth2" && <OAuth2Form auth={auth} onChange={onChange} collectionId={collectionId} />}

      {auth.type !== "inherit" && auth.type !== "none" && (
        <p className="max-w-xl text-xs text-faint">Simpan rahasia di variabel environment bertipe secret, lalu rujuk dengan {"{{nama}}"}. Nilai secret tidak ikut ekspor.</p>
      )}
    </div>
  );
}

function OAuth2Form({ auth, onChange, collectionId }: { auth: OAuth2Auth; onChange: (a: Auth) => void; collectionId: string | null }) {
  const { fetchOAuthToken } = useWorkspace.getState();
  const pendingUrl = useWorkspace((s) => s.oauthPendingUrl);
  const [busy, setBusy] = useState<"new" | "refresh" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [redirectUri, setRedirectUri] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setRedirectUri(`${window.location.origin}/oauth/callback`);
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const set = (patch: Partial<OAuth2Auth>) => onChange({ ...auth, ...patch });

  const getToken = async (mode: "new" | "refresh") => {
    setBusy(mode);
    setError(null);
    try {
      onChange(await fetchOAuthToken(auth, collectionId, mode));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const expired = auth.accessToken && isTokenExpired(auth, now);
  const isCode = auth.grantType === "authorization_code";

  return (
    <>
      <div className={field}>
        <label className="text-sm text-muted">Grant type</label>
        <Select value={auth.grantType} onChange={(e) => set({ grantType: e.target.value as OAuth2Auth["grantType"] })}>
          <option value="authorization_code">Authorization Code</option>
          <option value="client_credentials">Client Credentials</option>
        </Select>
      </div>
      {isCode && (
        <>
          <div className={field}>
            <label className="text-sm text-muted">Auth URL</label>
            <TextInput className="font-mono" value={auth.authUrl} placeholder="https://idp.example.com/oauth/authorize" onChange={(e) => set({ authUrl: e.target.value })} />
          </div>
          <div className={field}>
            <span className="text-sm text-muted">Callback URL</span>
            <div className="flex min-w-0 items-center gap-1">
              <code className="min-w-0 flex-1 truncate rounded-[5px] border border-line bg-raised px-2.5 py-1.5 font-mono text-xs">{redirectUri}</code>
              <IconButton
                label="Salin callback URL"
                onClick={async () => {
                  await navigator.clipboard.writeText(redirectUri);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </IconButton>
            </div>
          </div>
        </>
      )}
      <div className={field}>
        <label className="text-sm text-muted">Token URL</label>
        <TextInput className="font-mono" value={auth.tokenUrl} placeholder="https://idp.example.com/oauth/token" onChange={(e) => set({ tokenUrl: e.target.value })} />
      </div>
      <div className={field}>
        <label className="text-sm text-muted">Client ID</label>
        <TextInput className="font-mono" value={auth.clientId} onChange={(e) => set({ clientId: e.target.value })} />
      </div>
      <div className={field}>
        <label className="text-sm text-muted">Client secret</label>
        <TextInput className="font-mono" type="password" value={auth.clientSecret} placeholder={isCode && auth.usePkce ? "kosongkan untuk public client" : "{{clientSecret}}"} onChange={(e) => set({ clientSecret: e.target.value })} />
      </div>
      <div className={field}>
        <label className="text-sm text-muted">Scope</label>
        <TextInput className="font-mono" value={auth.scope} placeholder="openid profile" onChange={(e) => set({ scope: e.target.value })} />
      </div>
      <div className={field}>
        <label className="text-sm text-muted">Autentikasi client</label>
        <Select value={auth.clientAuth} onChange={(e) => set({ clientAuth: e.target.value as OAuth2Auth["clientAuth"] })}>
          <option value="body">Kirim di body</option>
          <option value="basic">Basic auth header</option>
        </Select>
      </div>
      {isCode && (
        <label className="ml-[152px] flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-[var(--brass)]" checked={auth.usePkce} onChange={(e) => set({ usePkce: e.target.checked })} />
          Pakai PKCE (S256), disarankan
        </label>
      )}

      <div className="mt-1 max-w-[572px] rounded-md border border-line p-3">
        <div className="flex flex-wrap items-center gap-2">
          <KeyRound size={14} className="text-muted" />
          <span className="text-sm font-medium">Access token</span>
          {auth.accessToken ? (
            expired ? (
              <span className="text-xs text-warn">kedaluwarsa</span>
            ) : (
              <span className="text-xs text-ok">{auth.expiresAt ? `berlaku sampai ${new Date(auth.expiresAt).toLocaleTimeString("id-ID")}` : "tersedia"}</span>
            )
          ) : (
            <span className="text-xs text-faint">belum ada</span>
          )}
          <div className="ml-auto flex items-center gap-1">
            {auth.refreshToken && (
              <Button variant="ghost" className="h-7" disabled={!!busy} onClick={() => void getToken("refresh")}>
                {busy === "refresh" ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Refresh
              </Button>
            )}
            {auth.accessToken && (
              <IconButton label="Hapus token" onClick={() => set({ accessToken: "", refreshToken: undefined, expiresAt: undefined, tokenType: undefined })}>
                <Trash2 size={13} />
              </IconButton>
            )}
            <Button variant="outline" className="h-7" disabled={!!busy} onClick={() => void getToken("new")}>
              {busy === "new" ? <Loader2 size={13} className="animate-spin" /> : null} Ambil token baru
            </Button>
          </div>
        </div>
        <TextInput
          className="mt-2 font-mono"
          type="password"
          aria-label="Access token"
          value={auth.accessToken}
          placeholder="Atau tempel token di sini"
          onChange={(e) => set({ accessToken: e.target.value, expiresAt: undefined })}
        />
        {busy === "new" && pendingUrl && (
          <p className="mt-2 text-xs text-warn">
            Browser memblokir jendela login.{" "}
            <a href={pendingUrl} target="_blank" rel="noopener noreferrer" className="text-info underline">
              Buka halaman login
            </a>{" "}
            di tab baru; Packetman menunggu hasilnya di sini.
          </p>
        )}
        {error && <p className="mt-2 text-xs text-err">{error}</p>}
        <p className="mt-2 text-2xs text-faint">
          Token dikirim sebagai header Authorization: {auth.headerPrefix || "Bearer"} … Token hanya disimpan di browser ini dan tidak ikut ekspor. Request token memakai jalur kirim yang sama (extension, browser, atau relay dengan izinmu).
        </p>
      </div>
    </>
  );
}
