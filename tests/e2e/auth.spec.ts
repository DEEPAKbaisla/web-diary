import { expect, test } from "@playwright/test";
import { login, OWNER_EMAIL, OWNER_PASSWORD } from "./helpers";

test.describe("authentication", () => {
  test("redirects an unauthenticated visitor from the diary to the login page", async ({
    page,
  }) => {
    await page.goto("/trips");
    await expect(page).toHaveURL(/\/login/);
  });

  test("redirects an unauthenticated visitor from the new-trip page to the login page", async ({
    page,
  }) => {
    await page.goto("/trips/new");
    await expect(page).toHaveURL(/\/login/);
  });

  test("redirects the root page to the login page when signed out", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("shows a generic error for a wrong password", async ({ page }) => {
    await page.goto("/login");
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
    await page.getByLabel("Email").fill("nobody@test.local");
    await page.getByLabel("Password").fill("whatever-password");
    await page.getByRole("button", { name: "Login" }).click();

    await expect(page.locator("main [role='alert']")).toContainText(
      "Login nahi ho paya",
    );
  });

  test("signs the owner in and lands on the diary", async ({ page }) => {
    await page.goto("/login");
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

    await page.goto("/trips");
    await expect(page).toHaveURL(/\/login/);
  });

  test("never exposes the customer phone number before signing in", async ({
    page,
  }) => {
    await page.goto("/trips");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("body")).not.toContainText("9876543210");
  });
});
