import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

type LimitResult = { allowed: boolean; remaining: number; retry_after_seconds: number };

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function consumeDistributedLimit(scope: string, maximum: number, windowSeconds: number): Promise<LimitResult> {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = process.env.RATE_LIMIT_KEY_SECRET || serviceKey;
  if (!url || !serviceKey || !secret) {
    throw new Error("Distributed rate-limit configuration is unavailable.");
  }
  const scopeHash = await sha256(`${secret}:${scope}`);
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/consume_edge_rate_limit`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      p_scope_hash: scopeHash,
      p_limit: maximum,
      p_window_seconds: windowSeconds,
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Distributed rate limiter returned ${response.status}.`);
  const row = (await response.json())?.[0] as LimitResult | undefined;
  if (!row || typeof row.allowed !== "boolean") throw new Error("Distributed rate limiter returned an invalid response.");
  return row;
}

export async function middleware(request: NextRequest) {
  if (request.method === "POST") {
    const declaredSize = Number(request.headers.get("content-length") ?? 0);
    const size = declaredSize > 0 ? declaredSize : (await request.clone().arrayBuffer()).byteLength;
    if (Number.isFinite(size) && size > 1_048_576) {
      return NextResponse.json({ error: "Request body exceeds the 1 MB limit." }, { status: 413 });
    }
    const path = request.nextUrl.pathname;
    const sensitive = path === "/api/auth/register" || path === "/research/new" || path === "/api/research/start" || path.endsWith("/cancel") || path.endsWith("/export");
    if (sensitive) {
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        || request.headers.get("x-real-ip")
        || "local";
      const sessionIdentity = request.cookies.getAll()
        .filter((cookie) => cookie.name.includes("-auth-token"))
        .map((cookie) => cookie.value.slice(-24))
        .join(":") || "anonymous";
      const maximum = path === "/api/auth/register" ? 5 : (path === "/research/new" || path === "/api/research/start") ? 12 : 30;
      const routeScope = path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id");
      let ipLimit: LimitResult;
      let userLimit: LimitResult;
      try {
        [ipLimit, userLimit] = await Promise.all([
          consumeDistributedLimit(`ip:${ip}:${routeScope}`, maximum, 60),
          consumeDistributedLimit(`user:${sessionIdentity}:${routeScope}`, maximum, 60),
        ]);
      } catch {
        return NextResponse.json({ error: "Request protection is temporarily unavailable." }, {
          status: 503,
          headers: { "Retry-After": "5" },
        });
      }
      if (!ipLimit.allowed || !userLimit.allowed) {
        const retryAfter = Math.max(ipLimit.retry_after_seconds, userLimit.retry_after_seconds);
        return NextResponse.json({ error: "Too many requests. Please wait before trying again." }, {
          status: 429,
          headers: { "Retry-After": String(retryAfter), "X-RateLimit-Remaining": "0" },
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
