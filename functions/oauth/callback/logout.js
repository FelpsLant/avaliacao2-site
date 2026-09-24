import { parseCookies, clearCookie } from "../_shared/cookies.js";
import { sha256Hex } from "../_shared/crypto.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  const origin = request.headers.get("Origin");
  if (origin !== env.PUBLIC_BASE_URL) {
    return new Response("Origem invalida", {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const cookies = parseCookies(request);
  const sessionCookie = cookies["__Host-session"];

  if (sessionCookie) {
    const sessionHash = await sha256Hex(sessionCookie);
    await env.DB.prepare(`DELETE FROM sessions WHERE id_hash = ?`).bind(sessionHash).run();
  }

  const headers = new Headers();
  headers.append("Set-Cookie", clearCookie("__Host-session", { sameSite: "Strict" }));
  headers.set("Cache-Control", "no-store");
  headers.set("Location", env.PUBLIC_BASE_URL);

  
  return new Response(null, { status: 303, headers });
}


export async function onRequestGet() {
  return new Response("Method not allowed", {
    status: 405,
    headers: { "Cache-Control": "no-store", Allow: "POST" },
  });
}
