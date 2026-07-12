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
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
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
    path.startsWith("/api/auth") ||
    path.startsWith("/_next") ||
    path.includes("/favicon.ico")

  // Redirect unauthenticated users to sign-in
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = "/sign-in"
    url.searchParams.set("redirectTo", path + request.nextUrl.search)
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from sign-in
  if (user && path === "/sign-in") {
    const url = request.nextUrl.clone()
    url.pathname = "/dashboard"
    return NextResponse.redirect(url)
  }

  // Check onboarding status for authenticated users on protected pages
  // (not on onboarding page itself, auth pages, or API routes)
  if (user && !isPublicPath && path !== "/onboarding" && !path.startsWith("/api/")) {
    try {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("onboarding_completed")
        .eq("id", user.id)
        .single()

      // If no profile or onboarding not completed, redirect to onboarding
      if (!profile || !profile.onboarding_completed) {
        const url = request.nextUrl.clone()
        url.pathname = "/onboarding"
        return NextResponse.redirect(url)
      }
    } catch {
      // If the table doesn't exist yet or any error, allow through
      // This prevents breaking the app before migrations run
    }
  }

  return supabaseResponse
}
