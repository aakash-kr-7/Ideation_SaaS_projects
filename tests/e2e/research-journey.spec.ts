import { expect, test } from "@playwright/test";

test.describe("public and authenticated route contracts", () => {
  test("landing page exposes the two canonical report modes", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/ShouldBuild/);
    await expect(page.getByRole("heading", { level: 1, name: /Don't guess/i })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Quick Scan" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Full Validation" })).toBeVisible();
  });

  test("sample reports render both current schemas", async ({ page }) => {
    await page.goto("/sample-report?mode=quick_scan");
    await expect(page.getByRole("heading", { level: 1, name: "See the difference in research depth" })).toBeVisible();
    const quick = page.getByRole("tab", { name: /Quick Scan/ });
    const full = page.getByRole("tab", { name: /Full Validation/ });
    await expect(quick).toHaveAttribute("aria-selected", "true");
    await full.click();
    await expect(full).toHaveAttribute("aria-selected", "true");
  });

  test("unauthenticated dashboard access redirects to sign in", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
    await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
  });
});
