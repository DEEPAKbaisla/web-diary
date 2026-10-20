import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, DB_ERROR } = vi.hoisted(() => ({
  getSession: vi.fn(),
  DB_ERROR:
    "P1001: Can't reach database server at postgres://owner:sup3rs3cret@db.internal:5432/diary",
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession } },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(
    async () => new Headers({ "x-forwarded-for": "203.0.113.42" }),
  ),
}));

// Simulate a database outage for every query the route performs.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    trip: {
      create: vi.fn().mockRejectedValue(new Error(DB_ERROR)),
      findMany: vi.fn().mockRejectedValue(new Error(DB_ERROR)),
      aggregate: vi.fn().mockRejectedValue(new Error(DB_ERROR)),
    },
    $disconnect: vi.fn(),
  },
}));

import { GET, POST } from "@/app/api/trips/route";

const validTrip = {
  tripDate: "2026-10-20",
  fromLocation: "Connaught Place",
  toLocation: "India Gate",
  fare: 250,
  customerName: "Ramesh Kumar",
  customerPhone: "9876543210",
};

beforeEach(() => {
  getSession.mockResolvedValue({
    user: { id: "user-1" },
    session: { id: "session-1" },
  });
});

function assertNoLeakedInternals(text: string) {
  expect(text).not.toContain("P1001");
  expect(text).not.toContain("postgres://");
  expect(text).not.toContain("sup3rs3cret");
  expect(text).not.toContain("db.internal");
  expect(text).not.toContain("PrismaClient");
  expect(text).not.toContain("at Object");
  expect(text).not.toContain("stack");
}

describe("database failures", () => {
  it("returns a generic 500 when creating a trip fails", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/trips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validTrip),
      }),
    );

    expect(response.status).toBe(500);
    const text = await response.text();
    assertNoLeakedInternals(text);

    const body = JSON.parse(text);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });

  it("returns a generic 500 when loading trips fails", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/trips?date=2026-10-20"),
    );

    expect(response.status).toBe(500);
    const text = await response.text();
    assertNoLeakedInternals(text);
  });
});
