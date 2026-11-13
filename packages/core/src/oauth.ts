import { base64EncodeUtf8 } from "./encoding";
import type { OAuth2Auth, ResolvedRequest } from "./model";

/**
 * OAuth 2.0 helpers (RFC 6749 + PKCE, RFC 7636). Pure functions: the web app
 * opens the authorization popup and sends the token request through the same
 * executors as any other request.
 */

function base64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomString(length = 43): string {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => charset[b % charset.length]).join("");
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export async function generatePkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomString(64);
  return { verifier, challenge: await pkceChallenge(verifier) };
}

type Resolve = (s: string) => string;

export function buildAuthorizeUrl(auth: OAuth2Auth, opts: { state: string; redirectUri: string; codeChallenge?: string }, resolve: Resolve = (s) => s): string {
  const base = resolve(auth.authUrl).trim();
  if (!base) throw new Error("Auth URL belum diisi.");
  const url = new URL(base);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", resolve(auth.clientId));
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("state", opts.state);
  const scope = resolve(auth.scope).trim();
  if (scope) url.searchParams.set("scope", scope);
  if (opts.codeChallenge) {
    url.searchParams.set("code_challenge", opts.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

export type TokenGrant =
  | { grant: "authorization_code"; code: string; redirectUri: string; codeVerifier?: string }
  | { grant: "client_credentials" }
  | { grant: "refresh_token"; refreshToken: string };

export function buildTokenRequest(auth: OAuth2Auth, grant: TokenGrant, resolve: Resolve = (s) => s): ResolvedRequest {
  const tokenUrl = resolve(auth.tokenUrl).trim();
  if (!tokenUrl) throw new Error("Token URL belum diisi.");
  const clientId = resolve(auth.clientId);
  const clientSecret = resolve(auth.clientSecret);
  const fields: [string, string][] = [["grant_type", grant.grant]];
  if (grant.grant === "authorization_code") {
    fields.push(["code", grant.code], ["redirect_uri", grant.redirectUri]);
    if (grant.codeVerifier) fields.push(["code_verifier", grant.codeVerifier]);
  }
  if (grant.grant === "refresh_token") fields.push(["refresh_token", grant.refreshToken]);
  const scope = resolve(auth.scope).trim();
  if (scope && grant.grant !== "authorization_code") fields.push(["scope", scope]);

  const headers: [string, string][] = [
    ["Content-Type", "application/x-www-form-urlencoded"],
    ["Accept", "application/json"],
  ];
  if (auth.clientAuth === "basic" && clientSecret) {
    headers.push(["Authorization", `Basic ${base64EncodeUtf8(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`)}`]);
  } else {
    fields.push(["client_id", clientId]);
    if (clientSecret) fields.push(["client_secret", clientSecret]);
  }
  return { method: "POST", url: tokenUrl, headers, body: { kind: "urlencoded", fields } };
}

export interface TokenResult {
  accessToken: string;
  tokenType?: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
}

/** Parse a token endpoint response (JSON, or form-encoded as some older providers return). */
export function parseTokenResponse(status: number, body: string, now = Date.now()): TokenResult {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(body) as Record<string, unknown>;
  } catch {
    data = Object.fromEntries(new URLSearchParams(body));
  }
  if (data.error || status >= 400) {
    const desc = data.error_description ? `: ${String(data.error_description)}` : "";
    throw new Error(`Token endpoint menolak (${status}) ${String(data.error ?? "error")}${desc}`);
  }
  const accessToken = typeof data.access_token === "string" ? data.access_token : "";
  if (!accessToken) throw new Error("Response token tidak berisi access_token.");
  const expiresIn = Number(data.expires_in);
  return {
    accessToken,
    tokenType: typeof data.token_type === "string" ? data.token_type : undefined,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
    expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? now + expiresIn * 1000 : undefined,
    scope: typeof data.scope === "string" ? data.scope : undefined,
  };
}

export function isTokenExpired(auth: Pick<OAuth2Auth, "expiresAt">, now = Date.now(), skewMs = 30_000): boolean {
  return auth.expiresAt !== undefined && auth.expiresAt - skewMs <= now;
}
