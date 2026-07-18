import { authCallbackUrl, authEntryUrl, onboardingUrl, safeAuthRedirect } from "./auth-redirect.ts";

declare const Deno: { test(name: string, fn: () => void | Promise<void>): void };

function assertEquals(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
}

Deno.test("authentication entry links preserve an internal destination", () => {
  assertEquals(
    authEntryUrl("/research/new?mode=quick_scan", "register"),
    "/sign-in?redirectTo=%2Fresearch%2Fnew%3Fmode%3Dquick_scan&view=register",
    "registration entry URL mismatch",
  );
  assertEquals(
    onboardingUrl("/research/new?mode=quick_scan"),
    "/onboarding?next=%2Fresearch%2Fnew%3Fmode%3Dquick_scan",
    "onboarding destination mismatch",
  );
});

Deno.test("authentication redirects reject external and protocol-relative URLs", () => {
  assertEquals(safeAuthRedirect("https://malicious.example/path"), "/dashboard", "external redirect was accepted");
  assertEquals(safeAuthRedirect("//malicious.example/path"), "/dashboard", "protocol-relative redirect was accepted");
  assertEquals(safeAuthRedirect("/dashboard?tour=start"), "/dashboard?tour=start", "valid application redirect was lost");
});

Deno.test("OAuth callback URL carries the sanitized destination", () => {
  assertEquals(
    authCallbackUrl("https://shouldbuild.test", "/research/new?mode=quick_scan"),
    "https://shouldbuild.test/api/auth/callback?next=%2Fresearch%2Fnew%3Fmode%3Dquick_scan",
    "callback URL mismatch",
  );
});
