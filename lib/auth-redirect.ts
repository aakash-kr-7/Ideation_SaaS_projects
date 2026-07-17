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
