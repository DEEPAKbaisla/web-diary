import { expect, test } from "@playwright/test";
import { OWNER_EMAIL } from "./helpers";

/**
 * This file is intentionally prefixed with `zz-` so that it runs last: the
 * login limiter is keyed by IP as well as by account, so exhausting it here
 * would otherwise block the sign-ins used by the other specs.
 */
test.describe("login rate limiting", () => {
  test("returns HTTP 429 after too many failed sign-in attempts", async ({
    page,
  }) => {
    let rateLimited = false;
    let status = 0;
    let body: unknown = null;

    for (let attempt = 0; attempt < 40 && !rateLimited; attempt += 1) {
      const response = await page.request.post("/api/auth/sign-in/email", {
        headers: { "content-type": "application/json" },
        data: { email: OWNER_EMAIL, password: "wrong-password" },
      });

      status = response.status();
      if (status === 429) {
        rateLimited = true;
        body = await response.json();
      }
    }

    expect(rateLimited).toBe(true);
    expect(status).toBe(429);

    const payload = body as { code?: string; message?: string };
    expect(payload.message).toBeTruthy();
    // The error message must stay safe: no password, no internals.
    expect(payload.message).not.toContain("wrong-password");
    expect(payload.message).not.toMatch(/postgres|DATABASE_URL|stack/i);
  });

  test("keeps blocking while the window is open", async ({ page }) => {
    const response = await page.request.post("/api/auth/sign-in/email", {
      headers: { "content-type": "application/json" },
      data: { email: OWNER_EMAIL, password: "wrong-password" },
    });

    expect(response.status()).toBe(429);
  });
});
