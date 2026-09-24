import { base64UrlDecode } from "./crypto.js";

function base64UrlDecodeToString(base64url) {
  return new TextDecoder().decode(base64UrlDecode(base64url));
}

export async function verifyGoogleIdToken(idToken, { clientId, nonce }) {
  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new Error("id_token mal formado");
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  const header = JSON.parse(base64UrlDecodeToString(encodedHeader));
  if (header.alg !== "RS256") {
    throw new Error("algoritmo inesperado no cabecalho do id_token");
  }

  const discoveryResponse = await fetch(
    "https://accounts.google.com/.well-known/openid-configuration"
  );
  if (!discoveryResponse.ok) {
    throw new Error("falha ao obter o documento de descoberta OIDC");
  }
  const discovery = await discoveryResponse.json();

  const jwksResponse = await fetch(discovery.jwks_uri);
  if (!jwksResponse.ok) {
    throw new Error("falha ao obter o JWKS");
  }
  const jwks = await jwksResponse.json();

  const jwk = jwks.keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    throw new Error("chave publica correspondente ao kid nao encontrada");
  }

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const signedData = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
  const signature = base64UrlDecode(encodedSignature);

  const validSignature = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    signature,
    signedData
  );
  if (!validSignature) {
    throw new Error("assinatura do id_token invalida");
  }

  const payload = JSON.parse(base64UrlDecodeToString(encodedPayload));
  const now = Math.floor(Date.now() / 1000);

  const validIssuer =
    payload.iss === discovery.issuer || payload.iss === "https://accounts.google.com";
  if (!validIssuer) {
    throw new Error("emissor (iss) invalido");
  }
  if (payload.aud !== clientId) {
    throw new Error("audiencia (aud) invalida");
  }
  if (typeof payload.exp !== "number" || payload.exp < now) {
    throw new Error("id_token expirado");
  }
  if (typeof payload.iat !== "number" || payload.iat > now + 60) {
    throw new Error("iat invalido (emitido no futuro)");
  }
  if (payload.nonce !== nonce) {
    throw new Error("nonce nao corresponde a transacao");
  }

  return payload;
}
