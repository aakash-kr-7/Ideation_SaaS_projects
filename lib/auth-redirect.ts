const DEFAULT_AUTH_REDIRECT = "/dashboard";

/**
 * Only allow same-site application paths after authentication.
 * This also keeps malformed query-string values away from router.replace().
 */
export function safeAuthRedirect(
  value: string | null | undefined,
  fallback = DEFAULT_AUTH_REDIRECT,
) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  try {
    const parsed = new URL(value, "http://shouldbuild.local");
    return parsed.origin === "http://shouldbuild.local"
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}

export function authCallbackUrl(origin: string, redirectTo: string) {
  const callback = new URL("/api/auth/callback", origin);
  callback.searchParams.set("next", safeAuthRedirect(redirectTo));
  return callback.toString();
}

export type AuthEntryView = "sign-in" | "register";

export function authEntryUrl(redirectTo: string, view: AuthEntryView = "sign-in") {
  const params = new URLSearchParams({ redirectTo: safeAuthRedirect(redirectTo) });
  if (view === "register") params.set("view", "register");
  return `/sign-in?${params.toString()}`;
}

export function onboardingUrl(redirectTo: string) {
  const params = new URLSearchParams({ next: safeAuthRedirect(redirectTo) });
  return `/onboarding?${params.toString()}`;
}
