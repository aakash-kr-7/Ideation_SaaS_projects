import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname

  // Public paths — no auth required
  const isPublicPath =
    path === "/" ||
    path === "/sign-in" ||
    path === "/sample-report" ||
    path === "/pricing" ||
    path.startsWith("/auth/") ||
    path.startsWith("/api/") ||
    path.startsWith("/_next") ||
    path.includes("/favicon.ico")

  // Helper to create a redirect response and copy over any updated session cookies
  const createRedirectResponse = (url: URL) => {
    const res = NextResponse.redirect(url)
    // Copy cookies from supabaseResponse to the new redirect response
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      res.cookies.set(cookie.name, cookie.value, cookie)
    })
    return res
  }

  // Redirect unauthenticated users to sign-in
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = "/sign-in"
    url.searchParams.set("redirectTo", path + request.nextUrl.search)
    return createRedirectResponse(url)
  }

  // Redirect authenticated users away from sign-in
  if (user && path === "/sign-in") {
    const url = request.nextUrl.clone()
    url.pathname = "/dashboard"
    return createRedirectResponse(url)
  }

  // Check onboarding status for authenticated users on protected pages
  // (not on onboarding page itself, auth pages, or API routes)
  if (user && !isPublicPath && path !== "/onboarding" && !path.startsWith("/api/")) {
    const { data: profile, error } = await supabase
      .from("users")
      .select("onboarding_completed")
      .eq("id", user.id)
      .single()

    if (error) {
      // If the error code is not 'PGRST116' (no rows returned), it's likely a database / table error.
      // E.g., the table doesn't exist yet in local development. We allow through in that case.
      if (error.code === "PGRST116") {
        const url = request.nextUrl.clone()
        url.pathname = "/onboarding"
        return createRedirectResponse(url)
      }
    } else if (!profile || !profile.onboarding_completed) {
      // If profile exists but onboarding is not completed, redirect to onboarding
      const url = request.nextUrl.clone()
      url.pathname = "/onboarding"
      return createRedirectResponse(url)
    }
  }

  return supabaseResponse
}
