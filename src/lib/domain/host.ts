const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

/** Hostname from a Host header, without the port: "localhost:3000" -> "localhost", "[::1]:3000" -> "::1". */
export function hostnameOf(hostHeader: string | null | undefined): string | null {
  if (!hostHeader) return null;
  const h = hostHeader.trim().toLowerCase();
  if (h.startsWith("[")) {
    const end = h.indexOf("]");
    return end === -1 ? null : h.slice(1, end) || null;
  }
  const colon = h.lastIndexOf(":");
  const name = colon === -1 ? h : h.slice(0, colon);
  return name || null;
}

/**
 * True when a request's Host header names this machine (or a host the user explicitly allowed).
 * The app has no login, so it must only answer requests addressed to localhost. Without this check
 * a hostile website can use DNS rebinding (its own domain pointing at 127.0.0.1) to read your data
 * through the browser, because the browser would treat the app as that site's own origin.
 */
export function isAllowedHost(hostHeader: string | null | undefined, extraHosts: string[] = []): boolean {
  const name = hostnameOf(hostHeader);
  if (!name) return false;
  if (LOCAL_HOSTNAMES.has(name)) return true;
  return extraHosts.some((h) => h.trim().toLowerCase() === name);
}

/** Splits the ALLOWED_HOSTS env var ("a.local, b.local") into hostnames. */
export function parseAllowedHosts(value: string | undefined): string[] {
  return (value ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/** True when an Origin header (if the browser sent one) points at the same host the request was sent to. */
export function isSameOrigin(origin: string | null | undefined, hostHeader: string | null | undefined): boolean {
  if (!origin) return true; // non-browser clients (curl) send none; the Host check still applies
  try {
    return new URL(origin).host.toLowerCase() === (hostHeader ?? "").trim().toLowerCase();
  } catch {
    return false;
  }
}
