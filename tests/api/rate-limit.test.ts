import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

beforeEach(async () => {
  await prisma.rateLimitBucket.deleteMany();
});

describe("rateLimitKey", () => {
  it("namespaces the key by scope", () => {
    expect(rateLimitKey({ scope: "login-ip", identifier: "1.2.3.4" })).toBe(
      "rl:login-ip:1.2.3.4",
    );
    expect(
      rateLimitKey({ scope: "login-account", identifier: "owner@test.local" }),
    ).toBe("rl:login-account:owner@test.local");
  });

  it("strips characters that could break the key format", () => {
    expect(
      rateLimitKey({ scope: "login-ip", identifier: "1.2.3.4; DROP TABLE trip" }),
    ).toBe("rl:login-ip:1.2.3.4DROPTABLEtrip");
  });

  it("falls back to a safe placeholder for an empty identifier", () => {
    expect(rateLimitKey({ scope: "login-account", identifier: "" })).toBe(
      "rl:login-account:unknown",
    );
  });
});

describe("checkRateLimit", () => {
  it("allows requests up to the limit", async () => {
    const key = rateLimitKey({ scope: "login-ip", identifier: "198.51.100.1" });

    const first = await checkRateLimit(key, 3, 60);
    const second = await checkRateLimit(key, 3, 60);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
  });

  it("blocks requests beyond the limit and reports a retry-after", async () => {
    const key = rateLimitKey({ scope: "login-ip", identifier: "198.51.100.2" });

    await checkRateLimit(key, 2, 60);
    await checkRateLimit(key, 2, 60);
    const third = await checkRateLimit(key, 2, 60);

    expect(third.ok).toBe(false);
    if (!third.ok) {
      expect(third.retryAfter).toBeGreaterThan(0);
      expect(third.retryAfter).toBeLessThanOrEqual(60);
    }
  });

  it("keeps separate keys independent", async () => {
    const ipKey = rateLimitKey({
      scope: "login-ip",
      identifier: "198.51.100.3",
    });
    const accountKey = rateLimitKey({
      scope: "login-account",
      identifier: "owner@test.local",
    });

    await checkRateLimit(ipKey, 1, 60);
    await checkRateLimit(ipKey, 1, 60);
    const blocked = await checkRateLimit(ipKey, 1, 60);
    const other = await checkRateLimit(accountKey, 1, 60);

    expect(blocked.ok).toBe(false);
    expect(other.ok).toBe(true);
  });

  it("shares state through the database rather than process memory", async () => {
    const key = rateLimitKey({
      scope: "login-ip",
      identifier: "198.51.100.4",
    });

    await checkRateLimit(key, 5, 60);
    const row = await prisma.rateLimitBucket.findUnique({ where: { key } });

    expect(row?.count).toBe(1);
  });

  it("fails open when the limiter itself cannot reach the database", async () => {
    const spy = vi
      .spyOn(prisma, "$queryRaw")
      .mockRejectedValue(new Error("database unavailable"));

    try {
      const result = await checkRateLimit(
        rateLimitKey({ scope: "login-ip", identifier: "198.51.100.5" }),
        1,
        60,
      );
      // Fail-open: a limiter outage must never lock the owner out.
      expect(result.ok).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});
