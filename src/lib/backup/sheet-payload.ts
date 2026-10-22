import type { TripRecord } from "./types";

/**
 * Builds the payload that is pushed to the Google Sheet.
 *
 * Everything in this module is pure: it takes trip rows and returns plain
 * arrays. No database, no network, no clock. That keeps it trivially unit
 * testable and lets the same builder be used by the CLI, the cron route and
 * the file export.
 */

/** A single cell. Numbers stay numbers so the Sheet can sum them. */
export type CellValue = string | number;

/** A tab is a header row followed by data rows. */
export type SheetRows = CellValue[][];

/** The full payload: one entry per tab, keyed by tab name. */
export type SheetPayload = {
  tabs: Record<string, SheetRows>;
};

export const TRIPS_TAB = "Trips";
export const DAILY_SUMMARY_TAB = "Daily Summary";
export const MONTHLY_SUMMARY_TAB = "Monthly Summary";
export const META_TAB = "Meta";

export const TRIP_COLUMNS = [
  "id",
  "tripDate",
  "fromLocation",
  "toLocation",
  "fare",
  "customerName",
  "customerPhone",
  "createdAt",
  "updatedAt",
  // Added at the end on purpose. The Apps Script keeps `createdAt` and
  // `updatedAt` as plain text by column index, so moving them would let
  // Google Sheets turn the timestamps into dates.
  "kharch",
] as const;

export type TripSummary = {
  tripCount: number;
  totalFare: number;
  /** The extra expenses of every trip, in whole rupees. */
  totalKharch: number;
  /** What is left of the fare after the extra expenses. */
  bachat: number;
  /** Per-day totals, oldest first. */
  daily: Array<{ date: string; trips: number; totalFare: number }>;
  /** Per-month totals, oldest first. `YYYY-MM`. */
  monthly: Array<{
    month: string;
    trips: number;
    totalFare: number;
    totalKharch: number;
    bachat: number;
  }>;
};

/** A money column read as text, as a number. Anything unreadable is zero. */
function toAmount(value: string | undefined): number {
  const amount = Number.parseInt(value ?? "", 10);
  return Number.isFinite(amount) ? amount : 0;
}

/** Roll trips up into daily and monthly totals. */
export function summarizeTrips(trips: TripRecord[]): TripSummary {
  const dailyMap = new Map<string, { trips: number; totalFare: number }>();
  const monthlyMap = new Map<
    string,
    { trips: number; totalFare: number; totalKharch: number }
  >();

  let totalFare = 0;
  let totalKharch = 0;

  for (const trip of trips) {
    const amount = toAmount(trip.fare);
    const kharch = toAmount(trip.kharch);
    totalFare += amount;
    totalKharch += kharch;

    const day = dailyMap.get(trip.tripDate);
    if (day) {
      day.trips += 1;
      day.totalFare += amount;
    } else {
      dailyMap.set(trip.tripDate, { trips: 1, totalFare: amount });
    }

    const month = trip.tripDate.slice(0, 7);
    const monthEntry = monthlyMap.get(month);
    if (monthEntry) {
      monthEntry.trips += 1;
      monthEntry.totalFare += amount;
      monthEntry.totalKharch += kharch;
    } else {
      monthlyMap.set(month, {
        trips: 1,
        totalFare: amount,
        totalKharch: kharch,
      });
    }
  }

  return {
    tripCount: trips.length,
    totalFare,
    totalKharch,
    bachat: totalFare - totalKharch,
    daily: [...dailyMap.entries()]
      .map(([date, value]) => ({ date, ...value }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    monthly: [...monthlyMap.entries()]
      .map(([month, value]) => ({
        month,
        trips: value.trips,
        totalFare: value.totalFare,
        totalKharch: value.totalKharch,
        bachat: value.totalFare - value.totalKharch,
      }))
      .sort((a, b) => a.month.localeCompare(b.month)),
  };
}

/** The `Trips` tab: one row per trip, in the order supplied. */
export function buildTripRows(trips: TripRecord[]): SheetRows {
  return [
    [...TRIP_COLUMNS],
    ...trips.map((trip) => [
      trip.id,
      trip.tripDate,
      trip.fromLocation,
      trip.toLocation,
      toAmount(trip.fare),
      trip.customerName,
      trip.customerPhone,
      trip.createdAt,
      trip.updatedAt,
      toAmount(trip.kharch),
    ]),
  ];
}

/** The `Daily Summary` tab: one row per calendar day with trips. */
export function buildDailySummaryRows(summary: TripSummary): SheetRows {
  return [
    ["date", "trips", "totalFare"],
    ...summary.daily.map((row) => [row.date, row.trips, row.totalFare]),
  ];
}

/** The `Monthly Summary` tab: one row per calendar month with trips. */
export function buildMonthlySummaryRows(summary: TripSummary): SheetRows {
  return [
    ["month", "trips", "totalFare", "totalKharch", "bachat"],
    ...summary.monthly.map((row) => [
      row.month,
      row.trips,
      row.totalFare,
      row.totalKharch,
      row.bachat,
    ]),
  ];
}

/**
 * The `Meta` tab. It is written on every successful sync so the sheet itself
 * answers the question "is my backup alive?" without opening the app.
 *
 * `databaseSync` describes the standby-database copy of the *same* run, which
 * is why the database target runs before the sheet target.
 */
export function buildMetaRows(input: {
  syncedAt: string;
  summary: TripSummary;
  databaseSync: string;
  databaseSyncError?: string | null;
}): SheetRows {
  return [
    ["key", "value"],
    ["Last sync (UTC)", input.syncedAt],
    ["Trips", input.summary.tripCount],
    ["Total fare", input.summary.totalFare],
    ["Total kharch", input.summary.totalKharch],
    ["Total bachat", input.summary.bachat],
    ["Database sync", input.databaseSync],
    ["Database sync error", input.databaseSyncError ?? ""],
  ];
}

export type BuildSheetPayloadInput = {
  trips: TripRecord[];
  syncedAt: string;
  databaseSync: string;
  databaseSyncError?: string | null;
};

/** Build the complete multi-tab payload. */
export function buildSheetPayload(input: BuildSheetPayloadInput): SheetPayload {
  const summary = summarizeTrips(input.trips);
  return {
    tabs: {
      [TRIPS_TAB]: buildTripRows(input.trips),
      [DAILY_SUMMARY_TAB]: buildDailySummaryRows(summary),
      [MONTHLY_SUMMARY_TAB]: buildMonthlySummaryRows(summary),
      [META_TAB]: buildMetaRows({
        syncedAt: input.syncedAt,
        summary,
        databaseSync: input.databaseSync,
        databaseSyncError: input.databaseSyncError,
      }),
    },
  };
}

/** Quote a single CSV field if it contains anything that needs quoting. */
export function escapeCsvField(value: string | number): string {
  const text = String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * Render the trips as CSV, for the file-based export.
 *
 * A UTF-8 BOM is not included: the file is written as UTF-8 and Excel on
 * Windows handles the header row correctly because the content is ASCII.
 */
export function tripsToCsv(trips: TripRecord[]): string {
  const lines = [
    TRIP_COLUMNS.join(","),
    ...trips.map((trip) =>
      [
        trip.id,
        trip.tripDate,
        trip.fromLocation,
        trip.toLocation,
        trip.fare,
        trip.customerName,
        trip.customerPhone,
        trip.createdAt,
        trip.updatedAt,
        trip.kharch ?? "",
      ]
        .map(escapeCsvField)
        .join(","),
    ),
  ];
  return `${lines.join("\r\n")}\r\n`;
}
