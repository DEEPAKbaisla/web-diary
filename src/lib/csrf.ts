/**
 * Defense-in-depth CSRF protection for state-changing API requests.
 *
 * Better Auth already performs origin + Fetch Metadata validation on its own
 * routes, and the session cookie is `SameSite=Strict`. This helper adds an
 * explicit same-origin check for our custom mutating endpoints.
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");

  // No Origin header (e.g. curl, server-to-server): rely on SameSite cookies.
  if (!origin) return true;

  const host = request.headers.get("host");
  if (!host) return false;

  try {
    const originUrl = new URL(origin);
    return originUrl.host === host;
  } catch {
    return false;
  }
}
