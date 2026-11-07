/** Parses a Cookie request header into an object (no cookie-parser dependency needed). */
export function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    if (!name) continue;
    let value = part.slice(index + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

/** Options for the auth cookie. Express's clearCookie needs the same options without maxAge. */
export function buildCookieOptions({ secure, sameSite, maxAgeMs }) {
  return { httpOnly: true, secure, sameSite, path: '/', maxAge: maxAgeMs };
}
