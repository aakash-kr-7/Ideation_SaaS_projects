import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  
  // Handle incoming error from Supabase Auth (e.g. user cancelled)
  const authError = searchParams.get('error')
  const authErrorDesc = searchParams.get('error_description')
  if (authError || authErrorDesc) {
    const msg = authErrorDesc || authError || 'Authentication failed'
    return NextResponse.redirect(`${origin}/sign-in?error=AuthCallbackError&message=${encodeURIComponent(msg)}`)
  }

  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as 'signup' | 'recovery' | 'email' | null
  const next = searchParams.get('next') ?? '/dashboard'

  // Handle OAuth code exchange (Google sign-in)
  if (code) {
    const cookieStore = await cookies()
    const redirectResponse = NextResponse.redirect(`${origin}${next}`)

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
              redirectResponse.cookies.set(name, value, options)
            })
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return redirectResponse
    }
    return NextResponse.redirect(`${origin}/sign-in?error=AuthCallbackError&message=${encodeURIComponent(error.message)}`)
  }

  // Handle email verification / password recovery token
  if (token_hash && type) {
    const cookieStore = await cookies()
    const targetPath = type === 'recovery' ? '/auth/reset-password' : next
    const redirectResponse = NextResponse.redirect(`${origin}${targetPath}`)

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
              redirectResponse.cookies.set(name, value, options)
            })
          },
        },
      }
    )

    const { error } = await supabase.auth.verifyOtp({ token_hash, type })
    if (!error) {
      return redirectResponse
    }
    return NextResponse.redirect(`${origin}/sign-in?error=VerificationError&message=${encodeURIComponent(error.message)}`)
  }

  // No valid params
  return NextResponse.redirect(`${origin}/sign-in?error=AuthCallbackError&message=${encodeURIComponent('Missing authentication parameters')}`)
}
