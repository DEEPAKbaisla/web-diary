import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "@/app/api/trips/[id]/route";
import { prisma } from "@/lib/prisma";
import {
  resetTestDatabase,
  seedTestUser,
  TEST_USER_ID,
} from "../helpers";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

// Same setup as the other route tests: the session is stubbed so these tests
// exercise the route logic (authorization, ownership, validation) rather than
// the auth lifecycle, which the Playwright suite already covers.
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession } },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(
    async () => new Headers({ "x-forwarded-for": "203.0.113.42" }),
  ),
}));

const TRIP_ID = "trip-to-edit";

async function seedTrip(overrides: Record<string, unknown> = {}) {
  return prisma.trip.create({
    data: {
      id: TRIP_ID,
      userId: TEST_USER_ID,
      tripDate: new Date("2026-10-20T00:00:00.000Z"),
      fromLocation: "Connaught Place",
      toLocation: "India Gate",
      fare: 250,
      kharch: 50,
      customerName: "Ramesh Kumar",
      customerPhone: "9876543210",
      createdAt: new Date("2026-10-20T10:00:00.000Z"),
      ...overrides,
    },
  });
}

function authenticate() {
  getSession.mockResolvedValue({
    user: { id: TEST_USER_ID, email: "owner@test.local" },
    session: { id: "session-1", userId: TEST_USER_ID },
  });
}

function signOut() {
  getSession.mockResolvedValue(null);
}

function patchRequest(
  id: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(`http://localhost:3000/api/trips/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const context = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(async () => {
  vi.restoreAllMocks();
  getSession.mockReset();
  await resetTestDatabase();
  await seedTestUser();
});

describe("PATCH /api/trips/[id] - authorization", () => {
  it("returns 401 without a session", async () => {
    signOut();
    await seedTrip();

    const response = await PATCH(patchRequest(TRIP_ID, { fare: 300 }), context(TRIP_ID));

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("does not change the trip without a session", async () => {
    signOut();
    await seedTrip();

    await PATCH(patchRequest(TRIP_ID, { fare: 300 }), context(TRIP_ID));

    const stored = await prisma.trip.findUnique({ where: { id: TRIP_ID } });
    expect(stored?.fare).toBe(250);
  });
});

describe("PATCH /api/trips/[id] - ownership", () => {
  beforeEach(() => authenticate());

  it("returns 404 for another user's trip", async () => {
    await seedTestUser("other-user-id", "other@test.local");
    await seedTrip({ userId: "other-user-id" });

    const response = await PATCH(
      patchRequest(TRIP_ID, { fare: 999 }),
      context(TRIP_ID),
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("NOT_FOUND");
  });

  it("leaves another user's trip untouched", async () => {
    await seedTestUser("other-user-id", "other@test.local");
    await seedTrip({ userId: "other-user-id" });

    await PATCH(patchRequest(TRIP_ID, { fare: 999 }), context(TRIP_ID));

    const stored = await prisma.trip.findUnique({ where: { id: TRIP_ID } });
    expect(stored?.fare).toBe(250);
  });

  it("returns 404 for an id that does not exist", async () => {
    const response = await PATCH(
      patchRequest("no-such-trip", { fare: 300 }),
      context("no-such-trip"),
    );

    expect(response.status).toBe(404);
  });

  it("does not leak whether the id exists for another user", async () => {
    await seedTestUser("other-user-id", "other@test.local");
    await seedTrip({ userId: "other-user-id" });

    const other = await PATCH(
      patchRequest(TRIP_ID, { fare: 999 }),
      context(TRIP_ID),
    );
    const missing = await PATCH(
      patchRequest("no-such-trip", { fare: 999 }),
      context("no-such-trip"),
    );

    expect(other.status).toBe(missing.status);
  });
});

describe("PATCH /api/trips/[id] - updating", () => {
  beforeEach(() => authenticate());

  it("updates every field and returns the trip", async () => {
    await seedTrip();

    const response = await PATCH(
      patchRequest(TRIP_ID, {
        tripDate: "2026-10-22",
        fromLocation: "  Sarai Kale Khan  ",
        toLocation: "Gurugram",
        fare: 640,
        kharch: 90,
        customerName: "Suresh",
        customerPhone: "+91 98123 45678",
      }),
      context(TRIP_ID),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({
      id: TRIP_ID,
      tripDate: "2026-10-22",
      fromLocation: "Sarai Kale Khan",
      toLocation: "Gurugram",
      fare: 640,
      kharch: 90,
      customerName: "Suresh",
      customerPhone: "9812345678",
    });

    const stored = await prisma.trip.findUnique({ where: { id: TRIP_ID } });
    expect(stored?.fare).toBe(640);
    expect(stored?.tripDate).toEqual(new Date("2026-10-22T00:00:00.000Z"));
  });

  it("changes only the fields that are sent", async () => {
    await seedTrip();

    const response = await PATCH(
      patchRequest(TRIP_ID, { fare: 300 }),
      context(TRIP_ID),
    );

    expect(response.status).toBe(200);
    const stored = await prisma.trip.findUnique({ where: { id: TRIP_ID } });
    expect(stored?.fare).toBe(300);
    // Everything else is exactly as it was.
    expect(stored?.kharch).toBe(50);
    expect(stored?.fromLocation).toBe("Connaught Place");
    expect(stored?.toLocation).toBe("India Gate");
    expect(stored?.customerName).toBe("Ramesh Kumar");
    expect(stored?.customerPhone).toBe("9876543210");
    expect(stored?.tripDate).toEqual(new Date("2026-10-20T00:00:00.000Z"));
  });

  it("clears the kharch when zero is sent", async () => {
    await seedTrip();

    const response = await PATCH(
      patchRequest(TRIP_ID, { kharch: 0 }),
      context(TRIP_ID),
    );

    expect(response.status).toBe(200);
    const stored = await prisma.trip.findUnique({ where: { id: TRIP_ID } });
    expect(stored?.kharch).toBe(0);
    // A kharch edit must not touch the fare.
    expect(stored?.fare).toBe(250);
  });

  it("stores several phone numbers on one trip", async () => {
    await seedTrip();

    const response = await PATCH(
      patchRequest(TRIP_ID, { customerPhone: "9876543210, 9812345678" }),
      context(TRIP_ID),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.customerPhone).toBe("9876543210,9812345678");

    const stored = await prisma.trip.findUnique({ where: { id: TRIP_ID } });
    expect(stored?.customerPhone).toBe("9876543210,9812345678");
  });

  it("accepts the documented maximum of five numbers", async () => {
    await seedTrip();

    const response = await PATCH(
      patchRequest(TRIP_ID, {
        customerPhone: "9876543210,9812345678,9811111111,9822222222,9833333333",
      }),
      context(TRIP_ID),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.customerPhone.split(",")).toHaveLength(5);
  });

  it("rejects more than five numbers", async () => {
    await seedTrip();

    const response = await PATCH(
      patchRequest(TRIP_ID, {
        customerPhone:
          "9876543210,9812345678,9811111111,9822222222,9833333333,9844444444",
      }),
      context(TRIP_ID),
    );

    expect(response.status).toBe(422);
    const stored = await prisma.trip.findUnique({ where: { id: TRIP_ID } });
    expect(stored?.customerPhone).toBe("9876543210");
  });

  it("leaves the trip unchanged when one number is invalid", async () => {
    await seedTrip();

    const response = await PATCH(
      patchRequest(TRIP_ID, { customerPhone: "9876543210, 12345" }),
      context(TRIP_ID),
    );

    expect(response.status).toBe(422);
    const stored = await prisma.trip.findUnique({ where: { id: TRIP_ID } });
    expect(stored?.customerPhone).toBe("9876543210");
  });

  it("rejects an empty update", async () => {
    await seedTrip();

    const response = await PATCH(patchRequest(TRIP_ID, {}), context(TRIP_ID));

    expect(response.status).toBe(422);
  });

  it("rejects a negative fare", async () => {
    await seedTrip();

    const response = await PATCH(
      patchRequest(TRIP_ID, { fare: -1 }),
      context(TRIP_ID),
    );

    expect(response.status).toBe(422);
  });

  it("rejects an invalid date", async () => {
    await seedTrip();

    const response = await PATCH(
      patchRequest(TRIP_ID, { tripDate: "2026-02-30" }),
      context(TRIP_ID),
    );

    expect(response.status).toBe(422);
    const stored = await prisma.trip.findUnique({ where: { id: TRIP_ID } });
    expect(stored?.tripDate).toEqual(new Date("2026-10-20T00:00:00.000Z"));
  });

  it("rejects a malformed JSON body", async () => {
    await seedTrip();

    const response = await PATCH(
      patchRequest(TRIP_ID, "{not json"),
      context(TRIP_ID),
    );

    expect(response.status).toBe(422);
  });

  it("rejects an oversized body", async () => {
    await seedTrip();

    const response = await PATCH(
      patchRequest(TRIP_ID, { fare: 300 }, { "content-length": "999999" }),
      context(TRIP_ID),
    );

    expect(response.status).toBe(413);
  });
});

describe("PATCH /api/trips/[id] - CSRF", () => {
  beforeEach(() => authenticate());

  it("rejects a request from a foreign origin", async () => {
    await seedTrip();

    const response = await PATCH(
      patchRequest(TRIP_ID, { fare: 300 }, { origin: "https://evil.example.com" }),
      context(TRIP_ID),
    );

    expect(response.status).toBe(403);
    const stored = await prisma.trip.findUnique({ where: { id: TRIP_ID } });
    expect(stored?.fare).toBe(250);
  });

  it("accepts a same-origin request", async () => {
    await seedTrip();

    const response = await PATCH(
      patchRequest(
        TRIP_ID,
        { fare: 300 },
        { origin: "http://localhost:3000", host: "localhost:3000" },
      ),
      context(TRIP_ID),
    );

    expect(response.status).toBe(200);
  });
});

describe("PATCH /api/trips/[id] - rate limiting", () => {
  beforeEach(() => authenticate());

  it("returns 429 once the limit is exceeded", async () => {
    await seedTrip();
    const previous = process.env.TRIP_RATE_LIMIT_MAX;
    process.env.TRIP_RATE_LIMIT_MAX = "2";

    try {
      const first = await PATCH(patchRequest(TRIP_ID, { fare: 301 }), context(TRIP_ID));
      const second = await PATCH(patchRequest(TRIP_ID, { fare: 302 }), context(TRIP_ID));
      const third = await PATCH(patchRequest(TRIP_ID, { fare: 303 }), context(TRIP_ID));

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(third.status).toBe(429);
      expect((await third.json()).error.code).toBe("RATE_LIMITED");
    } finally {
      process.env.TRIP_RATE_LIMIT_MAX = previous;
    }
  });
});
