/**
 * App-level auth gate (Edge runtime).
 *
 * Only checks for the presence of the app-auth cookie — signature verification
 * happens server-side in the dashboard layout and API handlers, since Node's
 * `crypto` HMAC isn't available in Edge. A spoofed cookie passes middleware
 * but fails verifyCookie() in the layout → user is redirected to /login.
 */
import { NextResponse, type NextRequest } from "next/server";
import { APP_AUTH_COOKIE } from "@/lib/appAuth";

const PUBLIC_PATHS = ["/login", "/denied"];
// /api/set-bom is a read-only diagnostic endpoint that returns the
// 세트BOM sheet contents as JSON. Whitelisted so the user can hit the
// URL directly in a browser tab to verify the fetch is working.
const PUBLIC_API_PREFIXES = ["/api/auth/", "/api/ping"];

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();
  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const cookie = req.cookies.get(APP_AUTH_COOKIE)?.value;
  if (cookie && cookie.length > 0) return NextResponse.next();

  // For API requests, return 401 JSON instead of redirecting
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized — login required" }, { status: 401 });
  }
  const url = new URL("/login", req.url);
  if (pathname !== "/") url.searchParams.set("callbackUrl", pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // Match everything except Next internals + favicon
    "/((?!_next/static|_next/image|favicon\\.ico).*)",
  ],
};
