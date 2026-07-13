import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as 'signup' | 'recovery' | 'email' | null
  const next = searchParams.get('next') ?? '/dashboard'

  const supabase = await createClient()

  // Handle OAuth code exchange (Google sign-in)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const forwardedHost = request.headers.get('x-forwarded-host')
      const isLocalEnv = process.env.NODE_ENV === 'development'
      const base = isLocalEnv ? origin : forwardedHost ? `https://${forwardedHost}` : origin
      const redirectUrl = `${base}${next}`
      
      const redirectResponse = NextResponse.redirect(redirectUrl)
      
      // Explicitly copy cookies from the cookie store to the redirect response
      // This guarantees they are sent to the browser during the redirect
      const cookieStore = await cookies()
      cookieStore.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie.name, cookie.value, cookie)
      })
      
      return redirectResponse
    }
    return NextResponse.redirect(`${origin}/sign-in?error=AuthCallbackError&message=${encodeURIComponent(error.message)}`)
  }

  // Handle email verification / password recovery token
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type })
    if (!error) {
      const targetPath = type === 'recovery' ? '/auth/reset-password' : next
      const redirectResponse = NextResponse.redirect(`${origin}${targetPath}`)
      
      const cookieStore = await cookies()
      cookieStore.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie.name, cookie.value, cookie)
      })
      
      return redirectResponse
    }
    return NextResponse.redirect(`${origin}/sign-in?error=VerificationError&message=${encodeURIComponent(error.message)}`)
  }

  // No valid params
  return NextResponse.redirect(`${origin}/sign-in?error=AuthCallbackError&message=${encodeURIComponent('Missing authentication parameters')}`)
}
