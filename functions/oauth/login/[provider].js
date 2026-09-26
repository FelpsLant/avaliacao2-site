import { isValidProvider, PROVIDERS } from "../../_shared/providers.js";
import { randomToken, sha256Hex, sha256Base64Url } from "../../_shared/crypto.js";
import { setCookie } from "../../_shared/cookies.js";

export async function onRequestGet(context) {
  try {
    const { request, env, params } = context;
    const provider = params.provider;

    if (!isValidProvider(provider)) {
      return new Response("Not found", { status: 404 });
    }

    const baseUrl = env.PUBLIC_BASE_URL;

    const state = randomToken();
    const codeVerifier = randomToken();
    const transactionId = randomToken();
    const nonce = provider === "google" ? randomToken() : null;

    const idHash = await sha256Hex(transactionId);
    const stateHash = await sha256Hex(state);
    const codeChallenge = await sha256Base64Url(codeVerifier);

    const expiresAt = Math.floor(Date.now() / 1000) + 600;

    await env.DB.prepare(
      `INSERT INTO oauth_transactions (id_hash, provider, state_hash, nonce, code_verifier, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(idHash, provider, stateHash, nonce, codeVerifier, expiresAt)
      .run();

    const redirectUri = `${baseUrl}/oauth/callback/${provider}`;
    const authUrl = new URL(PROVIDERS[provider].authorizationEndpoint);

    const clientId = provider === "google" ? env.GOOGLE_CLIENT_ID : env.GITHUB_CLIENT_ID;
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

    if (provider === "google") {
      authUrl.searchParams.set("scope", PROVIDERS.google.scope);
      authUrl.searchParams.set("nonce", nonce);
    }

    const headers = new Headers();
    headers.set("Location", authUrl.toString());
    headers.append(
      "Set-Cookie",
      setCookie("__Host-oauth-tx", transactionId, { maxAge: 600, sameSite: "Lax" })
    );
    headers.set("Cache-Control", "no-store");

    return new Response(null, { status: 302, headers });
  } catch (err) {
    // TEMPORÁRIO: mostra o erro na tela para debug. Remover depois.
    return new Response("ERRO DE DEBUG: " + err.message + "\n\n" + err.stack, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
