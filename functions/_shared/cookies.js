
export function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";
  const cookies = {};
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (name) cookies[name] = decodeURIComponent(value);
  });
  return cookies;
}


export function setCookie(name, value, { maxAge, sameSite = "Lax" } = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    `SameSite=${sameSite}`,
  ];
  if (typeof maxAge === "number") {
    parts.push(`Max-Age=${maxAge}`);
  }
  return parts.join("; ");
}


export function clearCookie(name, { sameSite = "Lax" } = {}) {
  return setCookie(name, "", { maxAge: 0, sameSite });
}
