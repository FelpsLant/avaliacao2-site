import { isValidProvider, PROVIDERS } from "../../_shared/providers.js";
import { randomToken, sha256Hex } from "../../_shared/crypto.js";
import { parseCookies, setCookie, clearCookie } from "../../_shared/cookies.js";
import { verifyGoogleIdToken } from "../../_shared/oidc.js";

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const provider = params.provider;

  if (!isValidProvider(provider)) {
    return new Response("Not found", { status: 404 });
  }

  const url = new URL(request.url);
  const errorParam = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (errorParam || !code || !state) {
    return noStoreError(400, "Pedido de retorno invalido");
  }

  const cookies = parseCookies(request);
  const txCookie = cookies["__Host-oauth-tx"];
  if (!txCookie) {
    return noStoreError(400, "Cookie de transacao ausente");
  }

  const idHash = await sha256Hex(txCookie);
  const now = Math.floor(Date.now() / 1000);

  const row = await env.DB.prepare(
    `SELECT provider, state_hash, nonce, code_verifier, expires_at
     FROM oauth_transactions WHERE id_hash = ?`
  )
    .bind(idHash)
    .first();

  if (!row || row.expires_at < now || row.provider !== provider) {
    return noStoreError(400, "Transacao inexistente ou expirada");
  }


  const stateHash = await sha256Hex(state);
  if (row.state_hash !== stateHash) {
    return noStoreError(400, "State invalido");
  }


  await env.DB.prepare(`DELETE FROM oauth_transactions WHERE id_hash = ?`).bind(idHash).run();

  const redirectUri = `${env.PUBLIC_BASE_URL}/oauth/callback/${provider}`;

  let identity;
  try {

    if (provider === "google") {
      identity = await handleGoogle({
        env,
        code,
        redirectUri,
        codeVerifier: row.code_verifier,
        nonce: row.nonce,
      });
    } else {
      identity = await handleGithub({ env, code, redirectUri, codeVerifier: row.code_verifier });
    }
  } catch (err) {
    return noStoreError(400, "Falha na confirmacao de identidade");
  }


  const sessionId = randomToken();
  const sessionHash = await sha256Hex(sessionId);
  const sessionExpiresAt = now + 8 * 60 * 60; // 8 horas

  await env.DB.prepare(
    `INSERT INTO sessions (id_hash, issuer, subject, email, display_name, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      sessionHash,
      identity.issuer,
      identity.subject,
      identity.email,
      identity.displayName,
      sessionExpiresAt,
      now
    )
    .run();

  const headers = new Headers();
  headers.set("Location", env.PUBLIC_BASE_URL);
  headers.append("Set-Cookie", clearCookie("__Host-oauth-tx", { sameSite: "Lax" }));
  headers.append(
    "Set-Cookie",
    setCookie("__Host-session", sessionId, { maxAge: 8 * 60 * 60, sameSite: "Strict" })
  );
  headers.set("Cache-Control", "no-store");

  return new Response(null, { status: 302, headers });
}

function noStoreError(status, message) {
  return new Response(message, {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
  });
}

async function handleGoogle({ env, code, redirectUri, codeVerifier, nonce }) {
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  const response = await fetch(PROVIDERS.google.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error("troca de token com o Google falhou");
  }

  const tokenData = await response.json();
  if (!tokenData.id_token) {
    throw new Error("id_token ausente na resposta do Google");
  }

  const payload = await verifyGoogleIdToken(tokenData.id_token, {
    clientId: env.GOOGLE_CLIENT_ID,
    nonce,
  });

  return {
    issuer: "https://accounts.google.com",
    subject: payload.sub,
    email: payload.email ?? null,
    displayName: payload.name ?? null,
  };
}

async function handleGithub({ env, code, redirectUri, codeVerifier }) {
  const body = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    client_secret: env.GITHUB_CLIENT_SECRET,
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
  });

  const tokenResponse = await fetch(PROVIDERS.github.tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  if (!tokenResponse.ok) {
    throw new Error("troca de token com o GitHub falhou");
  }

  const tokenData = await tokenResponse.json();
  const tokenType = (tokenData.token_type || "").toLowerCase();
  if (!tokenData.access_token || tokenType !== "bearer") {
    throw new Error("access_token ausente ou tipo de token inesperado");
  }


  const userResponse = await fetch(PROVIDERS.github.userInfoEndpoint, {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": PROVIDERS.github.apiVersion,
      "User-Agent": "oauth-pages-lab",
    },
  });

  if (userResponse.status !== 200) {
    throw new Error("falha ao consultar o perfil autenticado no GitHub");
  }

  const profile = await userResponse.json();
  if (typeof profile.id !== "number") {
    throw new Error("id numerico ausente no perfil do GitHub");
  }


  const revokeUrl = `https://api.github.com/applications/${env.GITHUB_CLIENT_ID}/grant`;
  const basicAuth = btoa(`${env.GITHUB_CLIENT_ID}:${env.GITHUB_CLIENT_SECRET}`);

  const revokeResponse = await fetch(revokeUrl, {
    method: "DELETE",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": PROVIDERS.github.apiVersion,
      "Content-Type": "application/json",
      "User-Agent": "oauth-pages-lab",
    },
    body: JSON.stringify({ access_token: tokenData.access_token }),
  });

  if (revokeResponse.status !== 204) {
    throw new Error("falha ao revogar a autorizacao da OAuth App");
  }

  return {
    issuer: "https://github.com",
    subject: String(profile.id),
    email: profile.email ?? null,
    displayName: profile.name ?? profile.login ?? null,
  };
}
