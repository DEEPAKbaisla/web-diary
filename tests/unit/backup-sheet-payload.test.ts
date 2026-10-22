import { describe, expect, it } from "vitest";
import {
  buildDailySummaryRows,
  buildMetaRows,
  buildMonthlySummaryRows,
  buildSheetPayload,
  buildTripRows,
  DAILY_SUMMARY_TAB,
  escapeCsvField,
  META_TAB,
  MONTHLY_SUMMARY_TAB,
  summarizeTrips,
  tripsToCsv,
  TRIPS_TAB,
} from "@/lib/backup/sheet-payload";
import {
  buildBackupFile,
  DATA_FILE_VERSION,
  parseBackupFile,
} from "@/lib/backup/data-file";
import type { TripRecord } from "@/lib/backup/types";

const trips: TripRecord[] = [
  {
    id: "trip-1",
    userId: "owner-1",
    tripDate: "2026-10-20",
    fromLocation: "Connaught Place",
    toLocation: "India Gate",
    fare: "250",
    kharch: "50",
    customerName: "Ramesh Kumar",
    customerPhone: "9876543210",
    createdAt: "2026-10-20T05:30:00.000Z",
    updatedAt: "2026-10-20T05:30:00.000Z",
  },
  {
    id: "trip-2",
    userId: "owner-1",
    tripDate: "2026-10-20",
    fromLocation: "Karol Bagh",
    toLocation: "Punjabi Bagh",
    fare: "120",
    kharch: "20",
    customerName: "Sita Devi",
    customerPhone: "9123456789",
    createdAt: "2026-10-20T09:05:00.000Z",
    updatedAt: "2026-10-20T09:05:00.000Z",
  },
  {
    id: "trip-3",
    userId: "owner-1",
    tripDate: "2026-11-02",
    fromLocation: "Airport",
    toLocation: "Noida Sector 18",
    fare: "900",
    kharch: "0",
    customerName: "Amit, Verma",
    customerPhone: "9000000001",
    createdAt: "2026-11-02T02:15:00.000Z",
    updatedAt: "2026-11-02T02:15:00.000Z",
  },
];

describe("summarizeTrips", () => {
  it("counts the trips and adds up the fares", () => {
    const summary = summarizeTrips(trips);
    expect(summary.tripCount).toBe(3);
    expect(summary.totalFare).toBe(1270);
  });

  it("adds up the kharch and works out the bachat", () => {
    const summary = summarizeTrips(trips);
    expect(summary.totalKharch).toBe(70);
    expect(summary.bachat).toBe(1200);
  });

  it("groups by day, oldest first", () => {
    const summary = summarizeTrips(trips);
    expect(summary.daily).toEqual([
      { date: "2026-10-20", trips: 2, totalFare: 370 },
      { date: "2026-11-02", trips: 1, totalFare: 900 },
    ]);
  });

  it("groups by month, oldest first", () => {
    const summary = summarizeTrips(trips);
    expect(summary.monthly).toEqual([
      {
        month: "2026-10",
        trips: 2,
        totalFare: 370,
        totalKharch: 70,
        bachat: 300,
      },
      {
        month: "2026-11",
        trips: 1,
        totalFare: 900,
        totalKharch: 0,
        bachat: 900,
      },
    ]);
  });

  it("handles an empty diary", () => {
    const summary = summarizeTrips([]);
    expect(summary.tripCount).toBe(0);
    expect(summary.totalFare).toBe(0);
    expect(summary.totalKharch).toBe(0);
    expect(summary.bachat).toBe(0);
    expect(summary.daily).toEqual([]);
    expect(summary.monthly).toEqual([]);
  });

  it("treats a trip without a kharch as zero", () => {
    const summary = summarizeTrips([
      { ...trips[0], kharch: undefined as unknown as string },
    ]);
    expect(summary.totalKharch).toBe(0);
    expect(summary.bachat).toBe(250);
  });
});

describe("buildTripRows", () => {
  it("starts with a header row", () => {
    const rows = buildTripRows(trips);
    expect(rows[0]).toEqual([
      "id",
      "tripDate",
      "fromLocation",
      "toLocation",
      "fare",
      "customerName",
      "customerPhone",
      "createdAt",
      "updatedAt",
      "kharch",
    ]);
    expect(rows).toHaveLength(trips.length + 1);
  });

  it("keeps the fare as a number so the sheet can sum it", () => {
    const rows = buildTripRows(trips);
    expect(rows[1][4]).toBe(250);
    expect(rows[3][4]).toBe(900);
  });

  it("keeps the kharch as a number so the sheet can sum it", () => {
    const rows = buildTripRows(trips);
    expect(rows[1][9]).toBe(50);
    expect(rows[2][9]).toBe(20);
    expect(rows[3][9]).toBe(0);
  });

  it("keeps every other value as it was read", () => {
    const rows = buildTripRows(trips);
    expect(rows[1][0]).toBe("trip-1");
    expect(rows[1][1]).toBe("2026-10-20");
    expect(rows[1][8]).toBe("2026-10-20T05:30:00.000Z");
  });
});

describe("buildDailySummaryRows and buildMonthlySummaryRows", () => {
  it("writes a header and one row per group", () => {
    const summary = summarizeTrips(trips);
    expect(buildDailySummaryRows(summary)).toEqual([
      ["date", "trips", "totalFare"],
      ["2026-10-20", 2, 370],
      ["2026-11-02", 1, 900],
    ]);
    expect(buildMonthlySummaryRows(summary)).toEqual([
      ["month", "trips", "totalFare", "totalKharch", "bachat"],
      ["2026-10", 2, 370, 70, 300],
      ["2026-11", 1, 900, 0, 900],
    ]);
  });
});

describe("buildMetaRows", () => {
  it("reports the standby status and its error", () => {
    const rows = buildMetaRows({
      syncedAt: "2026-11-02T06:00:00.000Z",
      summary: summarizeTrips(trips),
      databaseSync: "error",
      databaseSyncError: "The standby database is unreachable.",
    });

    expect(rows[0]).toEqual(["key", "value"]);
    expect(rows).toContainEqual(["Last sync (UTC)", "2026-11-02T06:00:00.000Z"]);
    expect(rows).toContainEqual(["Trips", 3]);
    expect(rows).toContainEqual(["Total fare", 1270]);
    expect(rows).toContainEqual(["Total kharch", 70]);
    expect(rows).toContainEqual(["Total bachat", 1200]);
    expect(rows).toContainEqual(["Database sync", "error"]);
    expect(rows).toContainEqual([
      "Database sync error",
      "The standby database is unreachable.",
    ]);
  });

  it("leaves the error empty when the standby worked", () => {
    const rows = buildMetaRows({
      syncedAt: "2026-11-02T06:00:00.000Z",
      summary: summarizeTrips(trips),
      databaseSync: "ok",
      databaseSyncError: null,
    });
    expect(rows).toContainEqual(["Database sync error", ""]);
  });
});

describe("buildSheetPayload", () => {
  it("builds every tab", () => {
    const payload = buildSheetPayload({
      trips,
      syncedAt: "2026-11-02T06:00:00.000Z",
      databaseSync: "ok",
    });

    expect(Object.keys(payload.tabs).sort()).toEqual(
      [DAILY_SUMMARY_TAB, META_TAB, MONTHLY_SUMMARY_TAB, TRIPS_TAB].sort(),
    );
    expect(payload.tabs[TRIPS_TAB]).toHaveLength(trips.length + 1);
    expect(payload.tabs[DAILY_SUMMARY_TAB]).toHaveLength(3);
    expect(payload.tabs[MONTHLY_SUMMARY_TAB]).toHaveLength(3);
    expect(payload.tabs[META_TAB].length).toBeGreaterThan(1);
  });
});

describe("escapeCsvField", () => {
  it("leaves plain values alone", () => {
    expect(escapeCsvField("India Gate")).toBe("India Gate");
    expect(escapeCsvField(250)).toBe("250");
  });

  it("quotes values that contain a comma", () => {
    expect(escapeCsvField("Amit, Verma")).toBe('"Amit, Verma"');
  });

  it("doubles embedded quotes", () => {
    expect(escapeCsvField('The "Big" One')).toBe('"The ""Big"" One"');
  });

  it("quotes values that contain a newline", () => {
    expect(escapeCsvField("line one\nline two")).toBe(
      '"line one\nline two"',
    );
  });
});

describe("tripsToCsv", () => {
  it("writes a header and one line per trip", () => {
    const csv = tripsToCsv(trips);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines).toHaveLength(trips.length + 1);
    expect(lines[0]).toBe(
      "id,tripDate,fromLocation,toLocation,fare,customerName,customerPhone,createdAt,updatedAt,kharch",
    );
  });

  it("quotes a customer name that contains a comma", () => {
    const csv = tripsToCsv(trips);
    expect(csv).toContain('"Amit, Verma"');
  });
});

describe("backup file", () => {
  const file = buildBackupFile({
    exportedAt: "2026-11-02T06:00:00.000Z",
    users: [
      {
        id: "owner-1",
        name: "Owner",
        email: "owner@example.com",
        emailVerified: true,
        image: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    accounts: [
      {
        id: "account-1",
        accountId: "owner-1",
        providerId: "credential",
        userId: "owner-1",
        accessToken: null,
        refreshToken: null,
        idToken: null,
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        scope: null,
        password: "$argon2id$hash",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    trips,
  });

  it("records the totals", () => {
    expect(file.version).toBe(DATA_FILE_VERSION);
    expect(file.tripCount).toBe(3);
    expect(file.totalFare).toBe(1270);
    expect(file.totalKharch).toBe(70);
    expect(file.bachat).toBe(1200);
    expect(file.credentialsOmitted).toBe(false);
  });

  it("survives a round trip through JSON", () => {
    const parsed = parseBackupFile(JSON.parse(JSON.stringify(file)));
    expect(parsed.trips).toHaveLength(3);
    expect(parsed.users[0].email).toBe("owner@example.com");
    expect(parsed.accounts[0].password).toBe("$argon2id$hash");
  });

  it("gives a file written before the kharch field a zero kharch", () => {
    const old = JSON.parse(JSON.stringify(file)) as {
      trips: Array<Record<string, unknown>>;
      totalKharch?: number;
      bachat?: number;
    };
    for (const trip of old.trips) {
      delete trip.kharch;
    }
    delete old.totalKharch;
    delete old.bachat;

    const parsed = parseBackupFile(old);
    expect(parsed.trips.every((trip) => trip.kharch === "0")).toBe(true);
    expect(parsed.totalKharch).toBe(0);
    expect(parsed.bachat).toBe(parsed.totalFare);
  });

  it("flags a file that left the credentials out", () => {
    const withoutCredentials = buildBackupFile({
      exportedAt: "2026-11-02T06:00:00.000Z",
      users: [],
      accounts: [],
      trips,
    });
    expect(withoutCredentials.credentialsOmitted).toBe(true);
  });

  it("rejects a file that is not an object", () => {
    expect(() => parseBackupFile("nope")).toThrow(/not a valid object/i);
  });

  it("rejects a file without a version", () => {
    expect(() => parseBackupFile({ trips: [], users: [], accounts: [] })).toThrow(
      /version/i,
    );
  });

  it("rejects a file from a newer format", () => {
    expect(() =>
      parseBackupFile({
        version: DATA_FILE_VERSION + 1,
        trips: [],
        users: [],
        accounts: [],
      }),
    ).toThrow(/format version/i);
  });

  it("rejects a file without trips", () => {
    expect(() =>
      parseBackupFile({ version: 1, users: [], accounts: [] }),
    ).toThrow(/trips/i);
  });

  it("rejects a malformed trip", () => {
    expect(() =>
      parseBackupFile({
        version: 1,
        users: [],
        accounts: [],
        trips: [{ id: 42 }],
      }),
    ).toThrow(/malformed trip/i);
  });
});
