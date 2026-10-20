import { describe, expect, it } from "vitest";
import {
  isValidDateOnly,
  loginSchema,
  MAX_FARE_INR,
  normalizeIndianMobile,
  toDateOnly,
  tripCreateSchema,
} from "@/lib/validations";

const validTrip = {
  tripDate: "2026-10-20",
  fromLocation: "Connaught Place",
  toLocation: "India Gate",
  fare: 250,
  customerName: "Ramesh Kumar",
  customerPhone: "9876543210",
};

describe("normalizeIndianMobile", () => {
  it("accepts a plain 10 digit number", () => {
    expect(normalizeIndianMobile("9876543210")).toBe("9876543210");
  });

  it("strips a +91 country code", () => {
    expect(normalizeIndianMobile("+91 98765 43210")).toBe("9876543210");
    expect(normalizeIndianMobile("+919876543210")).toBe("9876543210");
  });

  it("strips a leading zero", () => {
    expect(normalizeIndianMobile("09876543210")).toBe("9876543210");
  });

  it("rejects numbers that do not start with 6-9", () => {
    expect(normalizeIndianMobile("1234567890")).toBeNull();
    expect(normalizeIndianMobile("5876543210")).toBeNull();
  });

  it("rejects wrong lengths", () => {
    expect(normalizeIndianMobile("987654321")).toBeNull();
    expect(normalizeIndianMobile("98765432101")).toBeNull();
    expect(normalizeIndianMobile("")).toBeNull();
  });
});

describe("isValidDateOnly", () => {
  it("accepts real calendar dates", () => {
    expect(isValidDateOnly("2026-10-20")).toBe(true);
    expect(isValidDateOnly("2024-02-29")).toBe(true);
  });

  it("rejects impossible dates", () => {
    expect(isValidDateOnly("2026-02-30")).toBe(false);
    expect(isValidDateOnly("2026-13-01")).toBe(false);
    expect(isValidDateOnly("2026-00-10")).toBe(false);
    expect(isValidDateOnly("2026-10-32")).toBe(false);
  });

  it("rejects malformed formats", () => {
    expect(isValidDateOnly("20-10-2026")).toBe(false);
    expect(isValidDateOnly("2026/10/20")).toBe(false);
    expect(isValidDateOnly("not-a-date")).toBe(false);
    expect(isValidDateOnly("")).toBe(false);
  });
});

describe("toDateOnly", () => {
  it("formats a Date as YYYY-MM-DD in UTC", () => {
    expect(toDateOnly(new Date("2026-10-20T13:45:00.000Z"))).toBe("2026-10-20");
  });
});

describe("tripCreateSchema", () => {
  it("accepts a valid trip", () => {
    const result = tripCreateSchema.safeParse(validTrip);
    expect(result.success).toBe(true);
  });

  it("trims whitespace from text fields", () => {
    const result = tripCreateSchema.safeParse({
      ...validTrip,
      fromLocation: "  Connaught Place  ",
      toLocation: " India Gate ",
      customerName: "  Ramesh Kumar ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fromLocation).toBe("Connaught Place");
      expect(result.data.toLocation).toBe("India Gate");
      expect(result.data.customerName).toBe("Ramesh Kumar");
    }
  });

  it("normalises the mobile number", () => {
    const result = tripCreateSchema.safeParse({
      ...validTrip,
      customerPhone: "+91 98765 43210",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.customerPhone).toBe("9876543210");
    }
  });

  it("rejects missing required fields", () => {
    const result = tripCreateSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
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
    }
  });

  it("rejects blank locations and names", () => {
    const result = tripCreateSchema.safeParse({
      ...validTrip,
      fromLocation: "   ",
      toLocation: "",
      customerName: " ",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid date", () => {
    expect(tripCreateSchema.safeParse({ ...validTrip, tripDate: "2026-02-30" }).success).toBe(false);
    expect(tripCreateSchema.safeParse({ ...validTrip, tripDate: "20-10-2026" }).success).toBe(false);
  });

  it("rejects a negative fare", () => {
    expect(tripCreateSchema.safeParse({ ...validTrip, fare: -1 }).success).toBe(false);
  });

  it("rejects a fractional fare", () => {
    expect(tripCreateSchema.safeParse({ ...validTrip, fare: 250.5 }).success).toBe(false);
  });

  it("accepts a zero fare", () => {
    expect(tripCreateSchema.safeParse({ ...validTrip, fare: 0 }).success).toBe(true);
  });

  it("rejects a fare above the documented maximum", () => {
    expect(
      tripCreateSchema.safeParse({ ...validTrip, fare: MAX_FARE_INR + 1 }).success,
    ).toBe(false);
    expect(
      tripCreateSchema.safeParse({ ...validTrip, fare: MAX_FARE_INR }).success,
    ).toBe(true);
  });

  it("rejects an invalid mobile number", () => {
    expect(
      tripCreateSchema.safeParse({ ...validTrip, customerPhone: "12345" }).success,
    ).toBe(false);
    expect(
      tripCreateSchema.safeParse({ ...validTrip, customerPhone: "" }).success,
    ).toBe(false);
  });

  it("rejects oversized text fields", () => {
    expect(
      tripCreateSchema.safeParse({
        ...validTrip,
        fromLocation: "a".repeat(201),
      }).success,
    ).toBe(false);
    expect(
      tripCreateSchema.safeParse({
        ...validTrip,
        customerName: "a".repeat(121),
      }).success,
    ).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts a valid email and password", () => {
    expect(
      loginSchema.safeParse({ email: "owner@example.com", password: "secret123" })
        .success,
    ).toBe(true);
  });

  it("trims the email", () => {
    const result = loginSchema.safeParse({
      email: "  owner@example.com ",
      password: "secret123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("owner@example.com");
    }
  });

  it("rejects an invalid email", () => {
    expect(loginSchema.safeParse({ email: "not-an-email", password: "x" }).success).toBe(false);
  });

  it("rejects a missing password", () => {
    expect(loginSchema.safeParse({ email: "owner@example.com", password: "" }).success).toBe(false);
  });
});
