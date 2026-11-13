import { describe, expect, it } from "vitest";
import {
  buildAuthorizeUrl,
  buildRequest,
  buildTokenRequest,
  defaultOAuth2,
  emptyScopes,
  exportPostmanCollection,
  generatePkce,
  importPostmanCollection,
  isTokenExpired,
  newCollection,
  newRequest,
  parseTokenResponse,
  pkceChallenge,
} from "../src";

describe("oauth2", () => {
  it("computes the RFC 7636 PKCE S256 challenge", async () => {
    expect(await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    const { verifier, challenge } = await generatePkce();
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]{64}$/);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("builds the authorize URL with PKCE and resolved variables", () => {
    const auth = { ...defaultOAuth2(), authUrl: "{{idp}}/authorize", clientId: "web", scope: "openid email" };
    const url = new URL(
      buildAuthorizeUrl(auth, { state: "s1", redirectUri: "http://localhost:3000/oauth/callback", codeChallenge: "abc" }, (s) => s.replace("{{idp}}", "https://idp.dev")),
    );
    expect(url.origin + url.pathname).toBe("https://idp.dev/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "web",
      redirect_uri: "http://localhost:3000/oauth/callback",
      state: "s1",
      scope: "openid email",
      code_challenge: "abc",
      code_challenge_method: "S256",
    });
  });

  it("builds token requests with body or basic client auth", () => {
    const auth = { ...defaultOAuth2(), tokenUrl: "https://idp.dev/token", clientId: "app", clientSecret: "s3cr3t", scope: "read" };
    const body = buildTokenRequest(auth, { grant: "client_credentials" });
    expect(body.body).toEqual({
      kind: "urlencoded",
      fields: [
        ["grant_type", "client_credentials"],
        ["scope", "read"],
        ["client_id", "app"],
        ["client_secret", "s3cr3t"],
      ],
    });
    const basic = buildTokenRequest({ ...auth, clientAuth: "basic" }, { grant: "authorization_code", code: "c", redirectUri: "r", codeVerifier: "v" });
    expect(basic.headers).toContainEqual(["Authorization", `Basic ${btoa("app:s3cr3t")}`]);
    expect(basic.body.kind === "urlencoded" && basic.body.fields.map(([k]) => k)).toEqual(["grant_type", "code", "redirect_uri", "code_verifier"]);
  });

  it("parses token responses and errors", () => {
    const t = parseTokenResponse(200, '{"access_token":"at","token_type":"Bearer","expires_in":3600,"refresh_token":"rt"}', 1000);
    expect(t).toMatchObject({ accessToken: "at", refreshToken: "rt", expiresAt: 1000 + 3600_000 });
    expect(parseTokenResponse(200, "access_token=x&token_type=bearer").accessToken).toBe("x");
    expect(() => parseTokenResponse(400, '{"error":"invalid_grant","error_description":"code expired"}')).toThrow(/invalid_grant: code expired/);
    expect(isTokenExpired({ expiresAt: 10_000 }, 9_000, 0)).toBe(false);
    expect(isTokenExpired({ expiresAt: 10_000 }, 9_990, 30)).toBe(true);
  });

  it("adds the token as Authorization header", () => {
    const req = newRequest({ url: "https://api.dev/me", auth: { ...defaultOAuth2(), accessToken: "{{tok}}" } });
    const scopes = emptyScopes();
    scopes.environment.tok = "abc";
    expect(buildRequest(req, { scopes }).headers).toContainEqual(["Authorization", "Bearer abc"]);
  });

  it("round-trips Postman oauth2 config without exporting tokens", () => {
    const c = newCollection("c");
    c.auth = { ...defaultOAuth2(), grantType: "client_credentials", tokenUrl: "https://idp/token", clientId: "x", accessToken: "LEAK", refreshToken: "LEAK2" };
    const out = exportPostmanCollection(c);
    expect(JSON.stringify(out)).not.toContain("LEAK");
    const back = importPostmanCollection(out).value.auth;
    expect(back).toMatchObject({ type: "oauth2", grantType: "client_credentials", tokenUrl: "https://idp/token", clientId: "x", accessToken: "" });
  });
});
