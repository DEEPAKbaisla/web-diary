import { describe, expect, it } from "vitest";
import {
  formatMonthLabel,
  isValidMonth,
  monthEndExclusive,
  monthStart,
  shiftMonth,
  tripsQuerySchema,
} from "@/lib/validations";

describe("isValidMonth", () => {
  it("accepts a real month", () => {
    expect(isValidMonth("2026-01")).toBe(true);
    expect(isValidMonth("2026-10")).toBe(true);
    expect(isValidMonth("2026-12")).toBe(true);
  });

  it("rejects an impossible month", () => {
    expect(isValidMonth("2026-00")).toBe(false);
    expect(isValidMonth("2026-13")).toBe(false);
  });

  it("rejects a malformed month", () => {
    expect(isValidMonth("2026-1")).toBe(false);
    expect(isValidMonth("2026-10-01")).toBe(false);
    expect(isValidMonth("10-2026")).toBe(false);
    expect(isValidMonth("")).toBe(false);
  });
});

describe("month range", () => {
  it("starts at the first day of the month, at UTC midnight", () => {
    expect(monthStart("2026-10").toISOString()).toBe(
      "2026-10-01T00:00:00.000Z",
    );
  });

  it("ends exclusively at the first day of the next month", () => {
    expect(monthEndExclusive("2026-10").toISOString()).toBe(
      "2026-11-01T00:00:00.000Z",
    );
  });

  it("rolls the year over in December", () => {
    expect(monthEndExclusive("2026-12").toISOString()).toBe(
      "2027-01-01T00:00:00.000Z",
    );
  });
});

describe("shiftMonth", () => {
  it("moves forward and back within a year", () => {
    expect(shiftMonth("2026-10", 1)).toBe("2026-11");
    expect(shiftMonth("2026-10", -1)).toBe("2026-09");
  });

  it("rolls back across the year boundary", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("rolls forward across the year boundary", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("handles larger jumps", () => {
    expect(shiftMonth("2026-06", 12)).toBe("2027-06");
    expect(shiftMonth("2026-06", -18)).toBe("2024-12");
  });

  it("always returns a zero padded YYYY-MM", () => {
    expect(shiftMonth("2026-03", -2)).toBe("2026-01");
    expect(shiftMonth("2026-10", 0)).toBe("2026-10");
  });
});

describe("formatMonthLabel", () => {
  it("renders a readable month and year", () => {
    expect(formatMonthLabel("2026-10")).toContain("October");
    expect(formatMonthLabel("2026-10")).toContain("2026");
  });
});

describe("tripsQuerySchema", () => {
  it("accepts a date on its own", () => {
    expect(tripsQuerySchema.safeParse({ date: "2026-10-20" }).success).toBe(
      true,
    );
  });

  it("accepts a month on its own", () => {
    expect(tripsQuerySchema.safeParse({ month: "2026-10" }).success).toBe(true);
  });

  it("rejects both a date and a month", () => {
    expect(
      tripsQuerySchema.safeParse({ date: "2026-10-20", month: "2026-10" })
        .success,
    ).toBe(false);
  });

  it("rejects neither", () => {
    expect(tripsQuerySchema.safeParse({}).success).toBe(false);
  });

  it("rejects an invalid date", () => {
    expect(tripsQuerySchema.safeParse({ date: "2026-02-30" }).success).toBe(
      false,
    );
  });

  it("rejects an invalid month", () => {
    expect(tripsQuerySchema.safeParse({ month: "2026-13" }).success).toBe(false);
  });
});
