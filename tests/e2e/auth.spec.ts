import { expect, test } from "@playwright/test";
import { login, OWNER_EMAIL, OWNER_PASSWORD, settle } from "./helpers";

test.describe("authentication", () => {
  test("redirects an unauthenticated visitor from the diary to the login page", async ({
    page,
  }) => {
    await page.goto("/trips");
    await settle(page);
    await expect(page).toHaveURL(/\/login/);
  });

  test("redirects an unauthenticated visitor from the new-trip page to the login page", async ({
    page,
  }) => {
    await page.goto("/trips/new");
    await settle(page);
    await expect(page).toHaveURL(/\/login/);
  });

  test("redirects the root page to the login page when signed out", async ({
    page,
  }) => {
    await page.goto("/");
    await settle(page);
    await expect(page).toHaveURL(/\/login/);
  });

  test("shows a generic error for a wrong password", async ({ page }) => {
    await page.goto("/login");
    await settle(page);
    await page.getByLabel("Email").fill(OWNER_EMAIL);
    await page.getByLabel("Password").fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Login" }).click();

    // Scoped to <main> because Next.js renders its own route announcer with
    // role="alert" outside the page content.
    const alert = page.locator("main [role='alert']");
    await expect(alert).toContainText("Login nahi ho paya");
    // The error must not reveal whether the account exists.
    await expect(alert).not.toContainText(/not found|does not exist|unknown/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test("shows the same generic error for an unknown account", async ({
    page,
  }) => {
    await page.goto("/login");
    await settle(page);
    await page.getByLabel("Email").fill("nobody@test.local");
    await page.getByLabel("Password").fill("whatever-password");
    await page.getByRole("button", { name: "Login" }).click();

    await expect(page.locator("main [role='alert']")).toContainText(
      "Login nahi ho paya",
    );
  });

  test("signs the owner in and lands on the diary", async ({ page }) => {
    await page.goto("/login");
    await settle(page);
    await page.getByLabel("Email").fill(OWNER_EMAIL);
    await page.getByLabel("Password").fill(OWNER_PASSWORD);
    await page.getByRole("button", { name: "Login" }).click();

    await expect(page).toHaveURL(/\/trips/);
    await expect(
      page.getByRole("heading", { name: "Trip Diary" }),
    ).toBeVisible();
  });

  test("signs out and protects the pages again", async ({ page }) => {
    await login(page);

    await page.getByRole("button", { name: "Logout" }).click();
    await expect(page).toHaveURL(/\/login/);
    // The login form comes back once the owner has signed out.
    await expect(page.getByRole("button", { name: "Login" })).toBeVisible();

    await page.goto("/trips");
    await settle(page);
    await expect(page).toHaveURL(/\/login/);
  });

  test("never shows the login page to a signed-in owner", async ({ page }) => {
    await login(page);

    await page.goto("/login");
    await settle(page);

    await expect(page).toHaveURL(/\/trips/);
    // Count, not visibility: a flash of the form would still fail this.
    await expect(page.getByRole("button", { name: "Login" })).toHaveCount(0);
  });

  test("never shows the login page when going back in history", async ({
    page,
  }) => {
    await login(page);

    // The login page is behind us in the browser history. Whether the router
    // re-fetches it or restores a cached copy, the owner must never be shown
    // the login form.
    await page.goBack();
    await settle(page);

    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "Login" })).toHaveCount(0);
  });

  test("sends a signed-in owner from the root page to the diary", async ({
    page,
  }) => {
    await login(page);

    await page.goto("/");
    await settle(page);

    await expect(page).toHaveURL(/\/trips/);
    await expect(page.getByRole("button", { name: "Login" })).toHaveCount(0);
  });

  test("never exposes the customer phone number before signing in", async ({
    page,
  }) => {
    await page.goto("/trips");
    await settle(page);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("body")).not.toContainText("9876543210");
  });
});
