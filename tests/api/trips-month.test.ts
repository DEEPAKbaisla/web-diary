import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/trips/route";
import { prisma } from "@/lib/prisma";
import { resetTestDatabase, seedTestUser, TEST_USER_ID } from "../helpers";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession } },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(
    async () => new Headers({ "x-forwarded-for": "203.0.113.42" }),
  ),
}));

type Seed = {
  id: string;
  date: string;
  fare: number;
  kharch?: number;
  createdAt: string;
};

async function seedTrips(seeds: Seed[], userId = TEST_USER_ID) {
  await prisma.trip.createMany({
    data: seeds.map((seed) => ({
      id: seed.id,
      userId,
      tripDate: new Date(`${seed.date}T00:00:00.000Z`),
      fromLocation: "From",
      toLocation: "To",
      fare: seed.fare,
      kharch: seed.kharch ?? 0,
      customerName: "Customer",
      customerPhone: "9876543210",
      createdAt: new Date(seed.createdAt),
    })),
  });
}

function request(query: string) {
  return new Request(`http://localhost:3000/api/trips${query}`);
}

beforeEach(async () => {
  vi.restoreAllMocks();
  getSession.mockReset();
  await resetTestDatabase();
  await seedTestUser();
  getSession.mockResolvedValue({
    user: { id: TEST_USER_ID, email: "owner@test.local" },
    session: { id: "session-1", userId: TEST_USER_ID },
  });
});

describe("GET /api/trips?month= - authorization", () => {
  it("returns 401 without a session", async () => {
    getSession.mockResolvedValue(null);
    const response = await GET(request("?month=2026-10"));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });
});

describe("GET /api/trips?month= - validation", () => {
  it("rejects a malformed month", async () => {
    const response = await GET(request("?month=2026-13"));
    expect(response.status).toBe(422);
  });

  it("rejects a month that is not YYYY-MM", async () => {
    const response = await GET(request("?month=october"));
    expect(response.status).toBe(422);
  });

  it("rejects a date and a month together", async () => {
    const response = await GET(request("?date=2026-10-20&month=2026-10"));
    expect(response.status).toBe(422);
  });

  it("rejects a request with neither a date nor a month", async () => {
    const response = await GET(request(""));
    expect(response.status).toBe(422);
  });
});

describe("GET /api/trips?month= - results", () => {
  it("returns an empty report for a month without trips", async () => {
    const response = await GET(request("?month=2026-01"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({
      period: "2026-01",
      count: 0,
      totalFare: 0,
      days: [],
    });
  });

  it("groups the month by day with per-day totals", async () => {
    await seedTrips([
      {
        id: "t-1",
        date: "2026-10-10",
        fare: 250,
        createdAt: "2026-10-10T09:00:00.000Z",
      },
      {
        id: "t-2",
        date: "2026-10-10",
        fare: 100,
        createdAt: "2026-10-10T11:00:00.000Z",
      },
      {
        id: "t-3",
        date: "2026-10-12",
        fare: 77,
        createdAt: "2026-10-12T08:00:00.000Z",
      },
    ]);

    const response = await GET(request("?month=2026-10"));

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data.period).toBe("2026-10");
    expect(body.data.count).toBe(3);
    expect(body.data.totalFare).toBe(427);

    // Days are newest first.
    expect(body.data.days.map((day: { date: string }) => day.date)).toEqual([
      "2026-10-12",
      "2026-10-10",
    ]);

    const [newest, older] = body.data.days;
    expect(newest.count).toBe(1);
    expect(newest.totalFare).toBe(77);
    expect(older.count).toBe(2);
    expect(older.totalFare).toBe(350);

    // Within a day the newest trip comes first.
    expect(older.trips.map((trip: { id: string }) => trip.id)).toEqual([
      "t-2",
      "t-1",
    ]);
  });

  it("adds up the kharch of the month", async () => {
    await seedTrips([
      {
        id: "t-1",
        date: "2026-10-10",
        fare: 250,
        kharch: 40,
        createdAt: "2026-10-10T09:00:00.000Z",
      },
      {
        id: "t-2",
        date: "2026-10-12",
        fare: 100,
        kharch: 10,
        createdAt: "2026-10-12T08:00:00.000Z",
      },
    ]);

    const body = await (await GET(request("?month=2026-10"))).json();

    expect(body.data.totalFare).toBe(350);
    expect(body.data.totalKharch).toBe(50);
  });

  it("excludes trips from the neighbouring months", async () => {
    await seedTrips([
      {
        id: "before",
        date: "2026-09-30",
        fare: 999,
        createdAt: "2026-09-30T09:00:00.000Z",
      },
      {
        id: "inside",
        date: "2026-10-15",
        fare: 100,
        createdAt: "2026-10-15T09:00:00.000Z",
      },
      {
        id: "after",
        date: "2026-11-01",
        fare: 888,
        createdAt: "2026-11-01T09:00:00.000Z",
      },
    ]);

    const body = await (await GET(request("?month=2026-10"))).json();

    expect(body.data.count).toBe(1);
    expect(body.data.totalFare).toBe(100);
    expect(body.data.days[0].date).toBe("2026-10-15");
  });

  it("handles a month that spans a year boundary", async () => {
    await seedTrips([
      {
        id: "dec",
        date: "2025-12-31",
        fare: 50,
        createdAt: "2025-12-31T09:00:00.000Z",
      },
      {
        id: "jan",
        date: "2026-01-01",
        fare: 60,
        createdAt: "2026-01-01T09:00:00.000Z",
      },
      {
        id: "feb",
        date: "2026-02-01",
        fare: 70,
        createdAt: "2026-02-01T09:00:00.000Z",
      },
    ]);

    const body = await (await GET(request("?month=2026-01"))).json();

    expect(body.data.count).toBe(1);
    expect(body.data.days[0].date).toBe("2026-01-01");
    expect(body.data.totalFare).toBe(60);
  });

  it("never returns trips owned by another user", async () => {
    await seedTestUser("other-user-id", "other@test.local");
    await seedTrips(
      [
        {
          id: "other-trip",
          date: "2026-10-10",
          fare: 777,
          createdAt: "2026-10-10T09:00:00.000Z",
        },
      ],
      "other-user-id",
    );

    const response = await GET(request("?month=2026-10"));
    const text = await response.text();
    const body = JSON.parse(text);

    expect(body.data.count).toBe(0);
    expect(body.data.totalFare).toBe(0);
    expect(body.data.days).toEqual([]);
    expect(text).not.toContain("777");
  });
});

describe("GET /api/trips?date= - unchanged behaviour", () => {
  it("still returns a single day", async () => {
    await seedTrips([
      {
        id: "t-1",
        date: "2026-10-20",
        fare: 250,
        createdAt: "2026-10-20T09:00:00.000Z",
      },
    ]);

    const response = await GET(request("?date=2026-10-20"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({
      date: "2026-10-20",
      count: 1,
      totalFare: 250,
    });
    expect(body.data.trips).toHaveLength(1);
    expect(body.data.days).toBeUndefined();
    // The day view is untouched by the kharch work.
    expect(body.data.totalKharch).toBeUndefined();
  });
});
