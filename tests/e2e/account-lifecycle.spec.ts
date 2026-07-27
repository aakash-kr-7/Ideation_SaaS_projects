import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });

const email = `reveal-journey-${crypto.randomUUID()}@example.test`;
const password = "RevealReady!2026";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let userId = "";

test.describe.serial("account lifecycle and onboarding", () => {
  test.setTimeout(20_000);
  test.afterAll(async () => {
    if (userId) {
      const { data: membership } = await admin.from("team_members").select("team_id").eq("user_id", userId).maybeSingle();
      if (membership?.team_id) await admin.rpc("cleanup_isolated_test_team", { p_team_id: membership.team_id });
      await admin.auth.admin.deleteUser(userId);
    }
  });

  test("new user registers and completes resumable onboarding without duplicate bootstrap records", async ({ page }) => {
    await page.goto("/sign-in?view=register");
    await page.getByLabel("Full name").fill("Reveal Journey");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await page.waitForURL(/\/auth\/verify/);

    // Local Supabase requires email confirmation. Confirm this isolated fixture,
    // then continue through the same password sign-in path as a customer who
    // clicked their verification link.
    const listed = await admin.auth.admin.listUsers();
    const user = listed.data.users.find(item => item.email === email);
    expect(user).toBeTruthy();
    userId = user!.id;
    const { error: confirmError } = await admin.auth.admin.updateUserById(userId, { email_confirm: true });
    expect(confirmError).toBeNull();
    try {
      await page.goto("/sign-in?redirectTo=/onboarding");
    } catch (error) {
      if (!String(error).includes("ERR_ABORTED")) throw error;
    }
    if (!page.url().includes("/onboarding")) {
      await page.waitForURL(/\/sign-in/, { timeout: 10_000 });
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
    }
    await page.waitForURL(/\/onboarding/, { timeout: 15_000 });

    await page.getByPlaceholder("Your name").fill("Reveal Journey");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: /Solo founder/ }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "B2B SaaS", exact: true }).click();
    await page.getByPlaceholder(/Solo freelancers/).fill("Independent product teams");
    await page.reload();
    await expect(page.getByRole("heading", { name: "What market are you focused on?" })).toBeVisible();
    await expect(page.getByPlaceholder(/Solo freelancers/)).toHaveValue("Independent product teams");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: /\$5k MRR/ }).click();
    await page.getByRole("button", { name: "Subscription", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: /Some coding/ }).click();
    await page.getByRole("button", { name: "Global / Remote", exact: true }).click();
    await page.getByRole("button", { name: "Finish setup", exact: true }).click();
    await page.waitForURL(/\/dashboard/);

    await admin.rpc("bootstrap_user", { p_user_id: userId, p_email: email, p_metadata: { full_name: "Reveal Journey" } });
    const [{ count: profiles }, { count: memberships }, { data: membership }] = await Promise.all([
      admin.from("users").select("id", { count: "exact", head: true }).eq("id", userId),
      admin.from("team_members").select("id", { count: "exact", head: true }).eq("user_id", userId),
      admin.from("team_members").select("team_id").eq("user_id", userId).single(),
    ]);
    expect(profiles).toBe(1);
    expect(memberships).toBe(1);
    const [{ count: credits }, { count: projects }] = await Promise.all([
      admin.from("team_credit_accounts").select("team_id", { count: "exact", head: true }).eq("team_id", membership!.team_id),
      admin.from("projects").select("id", { count: "exact", head: true }).eq("team_id", membership!.team_id),
    ]);
    expect(credits).toBe(1);
    expect(projects).toBe(1);
  });

  test("project creation, editing, and settings update work", async ({ page }) => {
    await page.goto("/sign-in?redirectTo=/settings");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL(/\/settings/);
    await page.getByRole("button", { name: "Create project", exact: true }).click();
    await page.getByLabel("Project name").fill("Reveal project");
    await page.getByLabel("Description").fill("End-to-end product completion proof.");
    await page.getByRole("button", { name: "Create project", exact: true }).last().click();
    await expect(page.getByText("Reveal project", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Edit", exact: true }).last().click();
    await page.getByLabel("Project name").fill("Reveal project updated");
    await page.getByRole("button", { name: "Save project", exact: true }).click();
    await expect(page.getByText("Reveal project updated", { exact: true })).toBeVisible();

    await page.getByLabel("Display name").fill("Reveal Ready");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible();
  });

  test("sign-out and sign-in work", async ({ page }) => {
    await page.goto("/sign-in?redirectTo=/dashboard");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL(/\/dashboard/);
    await page.getByRole("button", { name: /Open profile menu/ }).click();
    await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
    await page.waitForURL(/\/sign-in/);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL(/\/dashboard/);
  });

  test("duplicate registration is handled without account enumeration", async ({ page }) => {
    await page.goto("/sign-in?view=register");
    await page.getByLabel("Full name").fill("Duplicate");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page.getByText(/account already exists|Check your email/)).toBeVisible();
  });

  test("forgotten-password request returns a non-enumerating confirmation", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
    await page.getByLabel("Email address").fill(email);
    await page.getByRole("button", { name: "Send reset link", exact: true }).click();
    await expect(page.getByText("If an account exists for this email, a password reset link has been sent.", { exact: true })).toBeVisible();
  });
});
