import { expect, type Page } from "@playwright/test";

export const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "owner@test.local";
export const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "TestOwnerPass123!";

/** Signs the owner in through the real login form. */
export async function login(
  page: Page,
  email: string = OWNER_EMAIL,
  password: string = OWNER_PASSWORD,
) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL(/\/trips/);
}
