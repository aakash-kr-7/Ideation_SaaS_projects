import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

type WindowEntry = { count: number; resetAt: number };
const rateWindows = new Map<string, WindowEntry>();

function limited(key: string, maximum: number, windowMs: number) {
  const now = Date.now();
  const entry = rateWindows.get(key);
  if (!entry || entry.resetAt <= now) {
    rateWindows.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > maximum;
}

export async function middleware(request: NextRequest) {
  if (request.method === "POST") {
    const size = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(size) && size > 1_048_576) {
      return NextResponse.json({ error: "Request body exceeds the 1 MB limit." }, { status: 413 });
    }
    const path = request.nextUrl.pathname;
    const sensitive = path === "/api/auth/register" || path === "/research/new" || path.endsWith("/cancel") || path.endsWith("/export");
    if (sensitive) {
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        || request.headers.get("x-real-ip")
        || "local";
      const sessionIdentity = request.cookies.getAll()
        .filter((cookie) => cookie.name.includes("-auth-token"))
        .map((cookie) => cookie.value.slice(-24))
        .join(":") || "anonymous";
      const maximum = path === "/api/auth/register" ? 5 : path === "/research/new" ? 12 : 30;
      if (limited(`ip:${ip}:${path}`, maximum, 60_000) || limited(`user:${sessionIdentity}:${path}`, maximum, 60_000)) {
        return NextResponse.json({ error: "Too many requests. Please wait before trying again." }, {
          status: 429,
          headers: { "Retry-After": "60" },
        });
      }
    }
  }
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
