import { parseCookies } from "../_shared/cookies.js";
import { sha256Hex } from "../_shared/crypto.js";

export async function onRequestGet(context) {
  const { request, env } = context;

  const cookies = parseCookies(request);
  const sessionCookie = cookies["__Host-session"];

  if (!sessionCookie) {
    return unauthorized();
  }

  const sessionHash = await sha256Hex(sessionCookie);
  const now = Math.floor(Date.now() / 1000);

  const row = await env.DB.prepare(
    `SELECT issuer, subject, email, display_name, expires_at FROM sessions WHERE id_hash = ?`
  )
    .bind(sessionHash)
    .first();

  if (!row || row.expires_at < now) {
    return unauthorized();
  }

  return Response.json(
    {
      issuer: row.issuer,
      subject: row.subject,
      email: row.email,
      displayName: row.display_name,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

function unauthorized() {
  return new Response("Unauthorized", {
    status: 401,
    headers: { "Cache-Control": "no-store" },
  });
}
