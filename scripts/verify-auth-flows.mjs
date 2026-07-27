import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

/**
 * Programmatic auth flow verification.
 * Uses the Supabase admin client to create a test user and exercise all
 * auth lifecycle operations, then cleans up.
 */

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !serviceKey || !anonKey) throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_ANON_KEY are required.");

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = crypto.randomUUID().slice(0, 8);
const email = `auth-verify-${suffix}@example.test`;
const password = `AuthReady!9${crypto.randomUUID()}`;

const checks = [];
let userId = "";

function check(name, passed, detail) {
  checks.push({ name, passed, detail });
  console.log(`  ${passed ? "✓" : "✗"} ${name}: ${detail}`);
}

try {
  // 1. Registration / user creation
  console.log("[auth] Creating test user...");
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Auth Verify ${suffix}` },
  });
  check("user_creation", !createError && !!created?.user, createError?.message || `userId=${created?.user?.id}`);
  userId = created?.user?.id || "";

  // 2. Bootstrap idempotency — call bootstrap_user twice
  console.log("[auth] Testing bootstrap idempotency...");
  const { error: bootstrap1 } = await admin.rpc("bootstrap_user", {
    p_user_id: userId,
    p_email: email,
    p_metadata: { full_name: `Auth Verify ${suffix}` },
  });
  check("bootstrap_first_call", !bootstrap1, bootstrap1?.message || "success");

  const { error: bootstrap2 } = await admin.rpc("bootstrap_user", {
    p_user_id: userId,
    p_email: email,
    p_metadata: { full_name: `Auth Verify ${suffix}` },
  });
  check("bootstrap_idempotent", !bootstrap2, bootstrap2?.message || "no duplicate records");

  // Verify exactly one user, one team, one credit account
  const [{ count: profileCount }, { count: memberCount }] = await Promise.all([
    admin.from("users").select("id", { count: "exact", head: true }).eq("id", userId),
    admin.from("team_members").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  check("bootstrap_one_profile", profileCount === 1, `profiles=${profileCount}`);
  check("bootstrap_one_membership", memberCount === 1, `memberships=${memberCount}`);

  const { data: membership } = await admin.from("team_members").select("team_id").eq("user_id", userId).single();
  const { count: creditCount } = await admin.from("team_credit_accounts").select("team_id", { count: "exact", head: true }).eq("team_id", membership?.team_id);
  check("bootstrap_one_credit_account", creditCount === 1, `credit_accounts=${creditCount}`);

  // 3. Sign-in with email/password
  console.log("[auth] Testing sign-in...");
  const user = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: session, error: signInError } = await user.auth.signInWithPassword({ email, password });
  check("sign_in", !signInError && !!session?.session, signInError?.message || "session created");

  // 4. Session: getUser returns the signed-in user
  const { data: { user: sessionUser }, error: getUserError } = await user.auth.getUser();
  check("session_valid", !getUserError && sessionUser?.id === userId, getUserError?.message || "user matches");

  // 5. Password reset request (programmatic — does not send real email)
  console.log("[auth] Testing password reset...");
  const { error: resetError } = await user.auth.resetPasswordForEmail(email, { redirectTo: `${url}` });
  check("password_reset_request", !resetError, resetError?.message || "reset requested");

  // 6. Sign-out
  console.log("[auth] Testing sign-out...");
  const { error: signOutError } = await user.auth.signOut();
  check("sign_out", !signOutError, signOutError?.message || "signed out");

  // 7. After sign-out, session should be invalid
  const { data: { user: afterSignOut } } = await user.auth.getUser();
  check("session_cleared", !afterSignOut, afterSignOut ? "session still active" : "session cleared");

  // 8. Duplicate registration returns a handled error, not enumeration
  console.log("[auth] Testing duplicate registration...");
  const { error: dupError } = await admin.auth.admin.createUser({
    email,
    password: `Dup!9${crypto.randomUUID()}`,
    email_confirm: true,
  });
  check("duplicate_handled", !!dupError, dupError?.message || "should have failed");

  // 9. Wrong password sign-in
  console.log("[auth] Testing wrong password...");
  const wrongUser = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: wrongPwError } = await wrongUser.auth.signInWithPassword({ email, password: "WrongPassword!1" });
  check("wrong_password_denied", !!wrongPwError, wrongPwError?.message || "should have been denied");

} finally {
  // Cleanup
  if (userId) {
    console.log("[auth] Cleaning up test user...");
    // Delete team data first
    const { data: membership } = await admin.from("team_members").select("team_id").eq("user_id", userId).single();
    if (membership) {
      const { error } = await admin.rpc("cleanup_isolated_test_team", { p_team_id: membership.team_id });
      if (error) console.error("Cleanup error:", error.message);
    }
    await admin.auth.admin.deleteUser(userId);
  }
}

// Summary
const passed = checks.filter((c) => c.passed).length;
const failed = checks.filter((c) => !c.passed).length;
console.log(JSON.stringify({
  result: failed === 0 ? "PASS" : "FAIL",
  passed,
  failed,
  failureDetails: checks.filter((c) => !c.passed),
  checkedAt: new Date().toISOString(),
}, null, 2));

if (failed > 0) process.exitCode = 1;
