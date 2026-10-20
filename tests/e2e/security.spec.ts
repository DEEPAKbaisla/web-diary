import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("security", () => {
  test("sets the expected security headers", async ({ page }) => {
    const response = await page.goto("/login");
    const headers = response!.headers();

    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBeTruthy();
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["x-powered-by"]).toBeUndefined();
  });

  test("sets a strict content security policy with a per-request nonce", async ({
    page,
  }) => {
    const response = await page.goto("/login");
    const csp = response!.headers()["content-security-policy"];

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'nonce-");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  test("does not leak the customer phone number to an unauthenticated caller", async ({
    request,
  }) => {
    const response = await request.get("/api/trips?date=2026-03-15");

    expect(response.status()).toBe(401);
    const text = await response.text();
    expect(text).not.toContain("9876543210");
    expect(text).not.toContain("Ramesh");
  });

  test("rejects a trip creation request from a foreign origin", async ({
    page,
  }) => {
    await login(page);

    const response = await page.request.post("/api/trips", {
      headers: {
        "content-type": "application/json",
        origin: "https://evil.example.com",
      },
      data: {
        tripDate: "2026-03-15",
        fromLocation: "A",
        toLocation: "B",
        fare: 10,
        customerName: "CSRF Attempt",
        customerPhone: "9876543210",
      },
    });

    expect(response.status()).toBe(403);
  });

  test("rejects a trip creation request without a session", async ({
    request,
  }) => {
    const response = await request.post("/api/trips", {
      headers: { "content-type": "application/json" },
      data: {
        tripDate: "2026-03-15",
        fromLocation: "A",
        toLocation: "B",
        fare: 10,
        customerName: "No Session",
        customerPhone: "9876543210",
      },
    });

    expect(response.status()).toBe(401);
  });
});
