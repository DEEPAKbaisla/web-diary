import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/trips/route";
import { prisma } from "@/lib/prisma";
import {
  resetTestDatabase,
  seedTestUser,
  TEST_USER_ID,
} from "../helpers";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

// The session lookup is stubbed so these tests exercise the route logic
// (authorization, validation, rate limiting, database access) deterministically.
// The real session lifecycle is covered by the Playwright end-to-end tests.
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession } },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(
    async () => new Headers({ "x-forwarded-for": "203.0.113.42" }),
  ),
}));

const validTrip = {
  tripDate: "2026-10-20",
  fromLocation: "  Connaught Place  ",
  toLocation: "India Gate",
  fare: 250,
  customerName: "Ramesh Kumar",
  customerPhone: "+91 98765 43210",
};

function authenticate() {
  getSession.mockResolvedValue({
    user: { id: TEST_USER_ID, email: "owner@test.local" },
    session: { id: "session-1", userId: TEST_USER_ID },
  });
}

function signOut() {
  getSession.mockResolvedValue(null);
}

function postRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/trips", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function getRequest(date: string) {
  return new Request(`http://localhost:3000/api/trips?date=${date}`);
}

beforeEach(async () => {
  vi.restoreAllMocks();
  getSession.mockReset();
  await resetTestDatabase();
  await seedTestUser();
});

describe("GET /api/trips - authorization", () => {
  it("returns 401 without a session", async () => {
    signOut();
    const response = await GET(getRequest("2026-10-20"));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("does not leak trip data without a session", async () => {
    signOut();
    const response = await GET(getRequest("2026-10-20"));
    expect(await response.text()).not.toContain("9876543210");
  });
});

describe("GET /api/trips - validation", () => {
  beforeEach(() => authenticate());

  it("rejects a malformed date parameter", async () => {
    const response = await GET(getRequest("not-a-date"));
    expect(response.status).toBe(422);
  });

  it("rejects a missing date parameter", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/trips"),
    );
    expect(response.status).toBe(422);
  });

  it("rejects an impossible calendar date", async () => {
    const response = await GET(getRequest("2026-02-30"));
    expect(response.status).toBe(422);
  });
});

describe("GET /api/trips - results", () => {
  beforeEach(() => authenticate());

  it("returns an empty summary when the date has no trips", async () => {
    const response = await GET(getRequest("2026-01-01"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({
      date: "2026-01-01",
      count: 0,
      totalFare: 0,
      trips: [],
    });
  });

  it("returns every trip for the date, newest first, with count and total fare", async () => {
    await prisma.trip.createMany({
      data: [
        {
          id: "trip-1",
          userId: TEST_USER_ID,
          tripDate: new Date("2026-10-20T00:00:00.000Z"),
          fromLocation: "A",
          toLocation: "B",
          fare: 100,
          customerName: "First",
          customerPhone: "9876543210",
          createdAt: new Date("2026-10-20T10:00:00.000Z"),
        },
        {
          id: "trip-2",
          userId: TEST_USER_ID,
          tripDate: new Date("2026-10-20T00:00:00.000Z"),
          fromLocation: "C",
          toLocation: "D",
          fare: 250,
          customerName: "Second",
          customerPhone: "9876543211",
          createdAt: new Date("2026-10-20T11:00:00.000Z"),
        },
        {
          id: "trip-3",
          userId: TEST_USER_ID,
          tripDate: new Date("2026-10-21T00:00:00.000Z"),
          fromLocation: "E",
          toLocation: "F",
          fare: 999,
          customerName: "Other day",
          customerPhone: "9876543212",
          createdAt: new Date("2026-10-21T11:00:00.000Z"),
        },
      ],
    });

    const response = await GET(getRequest("2026-10-20"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.count).toBe(2);
    expect(body.data.totalFare).toBe(350);
    expect(body.data.trips).toHaveLength(2);
    // Newest first.
    expect(body.data.trips[0].id).toBe("trip-2");
    expect(body.data.trips[1].id).toBe("trip-1");
  });

  it("never returns trips owned by another user", async () => {
    await seedTestUser("other-user-id", "other@test.local");
    await prisma.trip.create({
      data: {
        id: "other-trip",
        userId: "other-user-id",
        tripDate: new Date("2026-10-20T00:00:00.000Z"),
        fromLocation: "Secret",
        toLocation: "Place",
        fare: 777,
        customerName: "Someone Else",
        customerPhone: "9000000000",
        createdAt: new Date("2026-10-20T12:00:00.000Z"),
      },
    });

    const response = await GET(getRequest("2026-10-20"));
    const text = await response.text();
    const body = JSON.parse(text);

    expect(body.data.count).toBe(0);
    expect(body.data.trips).toHaveLength(0);
    expect(text).not.toContain("9000000000");
  });
});

describe("POST /api/trips - authorization", () => {
  it("returns 401 without a session", async () => {
    signOut();
    const response = await POST(postRequest(validTrip));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("does not create a trip without a session", async () => {
    signOut();
    await POST(postRequest(validTrip));
    expect(await prisma.trip.count()).toBe(0);
  });
});

describe("POST /api/trips - validation", () => {
  beforeEach(() => authenticate());

  it("creates a trip and trims and normalises the input", async () => {
    const response = await POST(postRequest(validTrip));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.fromLocation).toBe("Connaught Place");
    expect(body.data.customerPhone).toBe("9876543210");
    expect(body.data.tripDate).toBe("2026-10-20");
    expect(body.data.fare).toBe(250);

    const stored = await prisma.trip.findFirst();
    expect(stored?.userId).toBe(TEST_USER_ID);
  });

  it("rejects missing required fields", async () => {
    const response = await POST(postRequest({}));

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    const paths = body.error.issues.map((issue: { path: string }) => issue.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "tripDate",
        "fromLocation",
        "toLocation",
        "fare",
        "customerName",
        "customerPhone",
      ]),
    );
    expect(await prisma.trip.count()).toBe(0);
  });

  it("rejects an invalid date", async () => {
    const response = await POST(
      postRequest({ ...validTrip, tripDate: "2026-02-30" }),
    );
    expect(response.status).toBe(422);
  });

  it("rejects a negative fare", async () => {
    const response = await POST(postRequest({ ...validTrip, fare: -1 }));
    expect(response.status).toBe(422);
  });

  it("rejects a fractional fare", async () => {
    const response = await POST(postRequest({ ...validTrip, fare: 12.5 }));
    expect(response.status).toBe(422);
  });

  it("rejects a fare above the documented maximum", async () => {
    const response = await POST(
      postRequest({ ...validTrip, fare: 1_000_001 }),
    );
    expect(response.status).toBe(422);
  });

  it("rejects an invalid mobile number", async () => {
    const response = await POST(
      postRequest({ ...validTrip, customerPhone: "12345" }),
    );
    expect(response.status).toBe(422);
  });

  it("rejects a malformed JSON body", async () => {
    const response = await POST(postRequest("{not json"));
    expect(response.status).toBe(422);
  });

  it("rejects an oversized body", async () => {
    const response = await POST(
      postRequest(validTrip, { "content-length": "999999" }),
    );
    expect(response.status).toBe(413);
  });
});

describe("POST /api/trips - CSRF", () => {
  beforeEach(() => authenticate());

  it("rejects a request from a foreign origin", async () => {
    const response = await POST(
      postRequest(validTrip, { origin: "https://evil.example.com" }),
    );

    expect(response.status).toBe(403);
    expect(await prisma.trip.count()).toBe(0);
  });

  it("accepts a same-origin request", async () => {
    const response = await POST(
      postRequest(validTrip, { origin: "http://localhost:3000", host: "localhost:3000" }),
    );
    expect(response.status).toBe(201);
  });
});

describe("POST /api/trips - rate limiting", () => {
  beforeEach(() => authenticate());

  it("returns 429 once the limit is exceeded", async () => {
    const previous = process.env.TRIP_RATE_LIMIT_MAX;
    process.env.TRIP_RATE_LIMIT_MAX = "2";

    try {
      const first = await POST(postRequest(validTrip));
      const second = await POST(postRequest(validTrip));
      const third = await POST(postRequest(validTrip));

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(third.status).toBe(429);

      const body = await third.json();
      expect(body.error.code).toBe("RATE_LIMITED");
      expect(typeof body.error.retryAfter).toBe("number");
    } finally {
      process.env.TRIP_RATE_LIMIT_MAX = previous;
    }
  });
});
