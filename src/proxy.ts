import { NextResponse, type NextRequest } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/**
 * Content-Security-Policy with a per-request nonce.
 *
 * The nonce lets Next.js attach it to its own inline/hydration scripts, keeping
 * a strong policy (no `'unsafe-inline'` for scripts) while still working. All
 * app pages are dynamically rendered (auth-gated), which is required for nonce
 * handling.
 */
function buildContentSecurityPolicy(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "upgrade-insecure-requests",
  ];
  return directives.join("; ");
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const contentSecurityPolicy = buildContentSecurityPolicy(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  // Page-level protection. API routes re-check the session inside their
  // handlers, so Proxy is only an optimistic redirect for pages here.
  if (request.nextUrl.pathname.startsWith("/trips")) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
