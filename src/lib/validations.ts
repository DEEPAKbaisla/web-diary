import { z } from "zod";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Documented maximum fare (whole INR). Configurable via MAX_FARE_INR. */
export const MAX_FARE_INR = parsePositiveInt(process.env.MAX_FARE_INR, 1_000_000);

/**
 * Documented maximum kharch (whole INR). Configurable via MAX_KHARCH_INR.
 *
 * Kept separate from the fare cap so the two amounts can be tuned
 * independently.
 */
export const MAX_KHARCH_INR = parsePositiveInt(
  process.env.MAX_KHARCH_INR,
  1_000_000,
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * How many phone numbers a single trip may record.
 *
 * A trip usually has one rider, but shared rides and return legs happen, so
 * the field accepts up to five numbers instead of one.
 */
export const MAX_TRIP_PHONES = 5;

/**
 * Length of the whole phone field as typed.
 *
 * `MAX_TRIP_PHONES` numbers of at most 15 characters plus separators fit
 * comfortably inside this, so the cap on typed length is a guard against
 * junk input rather than the real limit.
 */
const MAX_PHONE_FIELD_LENGTH = 200;

/** Returns the 10-digit Indian mobile number, or null when invalid. */
export function normalizeIndianMobile(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  if (digits.length === 10 && /^[6-9]/.test(digits)) return digits;
  return null;
}

/**
 * Splits a phone field into the individual numbers the driver typed.
 *
 * Commas, semicolons and newlines always separate numbers. A space is only a
 * separator when the chunk around it is not already a valid number on its
 * own — that is what keeps the space inside "98765 43210" from cutting a
 * single number in half, while still reading "9876543210 9812345678" as two.
 */
export function splitPhoneNumbers(input: string): string[] {
  return input
    .split(/[,;\n]+/)
    .flatMap((chunk) => {
      const trimmed = chunk.trim();
      if (!trimmed) return [];
      if (normalizeIndianMobile(trimmed)) return [trimmed];
      return trimmed.split(/\s+/).filter(Boolean);
    })
    .filter(Boolean);
}

/**
 * Up to five Indian mobile numbers, stored as normalised digits joined by
 * commas, e.g. `9876543210,9812345678`.
 *
 * Stored in one column on purpose: the Google Sheet, the CSV export and the
 * standby database all mirror `customerPhone` as a single cell, so keeping
 * the multi-value string in one column leaves every backup untouched.
 */
export const customerPhonesSchema = z
  .string()
  .trim()
  .max(
    MAX_PHONE_FIELD_LENGTH,
    `Mobile number bohot lamba hai (max ${MAX_PHONE_FIELD_LENGTH} characters)`,
  )
  .superRefine((value, ctx) => {
    const parts = splitPhoneNumbers(value);

    if (parts.length === 0) {
      ctx.addIssue({ code: "custom", message: "Mobile number zaroori hai" });
      return;
    }

    if (parts.length > MAX_TRIP_PHONES) {
      ctx.addIssue({
        code: "custom",
        message: `Ek trip mein maximum ${MAX_TRIP_PHONES} mobile number ho sakte hain`,
      });
      return;
    }

    for (const part of parts) {
      if (!normalizeIndianMobile(part)) {
        ctx.addIssue({
          code: "custom",
          message: `Sahi Indian mobile number daaliye (10 digits): ${part}`,
        });
        return;
      }
    }
  })
  .transform((value) => {
    const numbers = splitPhoneNumbers(value).map(
      (part) => normalizeIndianMobile(part) as string,
    );
    // The same rider typed twice is still one rider.
    return [...new Set(numbers)].join(",");
  });


/** True for a real calendar date in `YYYY-MM-DD` form. */
export function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Format a Date as a `YYYY-MM-DD` string in UTC. */
export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** True for a real month in `YYYY-MM` form. */
export function isValidMonth(value: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(value)) return false;
  const month = Number(value.slice(5, 7));
  return month >= 1 && month <= 12;
}

/** First day of the given `YYYY-MM` month, at UTC midnight. */
export function monthStart(value: string): Date {
  const [year, month] = value.split("-").map((part) => Number(part));
  return new Date(Date.UTC(year, month - 1, 1));
}

/**
 * First day of the month *after* `YYYY-MM`, at UTC midnight. Used as an
 * exclusive upper bound so the range never spills into the next month.
 */
export function monthEndExclusive(value: string): Date {
  const [year, month] = value.split("-").map((part) => Number(part));
  return new Date(Date.UTC(year, month, 1));
}

/** Shift a `YYYY-MM` month by `delta` months, rolling over the year. */
export function shiftMonth(value: string, delta: number): string {
  const [year, month] = value.split("-").map((part) => Number(part));
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Human label for a `YYYY-MM` month, e.g. "October 2026". */
export function formatMonthLabel(value: string): string {
  const [year, month] = value.split("-").map((part) => Number(part));
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date YYYY-MM-DD format me honi chahiye")
  .superRefine((value, ctx) => {
    if (!isValidDateOnly(value)) {
      ctx.addIssue({ code: "custom", message: "Ye date sahi nahi hai" });
    }
  });

const locationSchema = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} zaroori hai`)
    .max(200, `${label} bohot lamba hai (max 200)`);

const customerNameSchema = z
  .string()
  .trim()
  .min(1, "Customer ka naam zaroori hai")
  .max(120, "Customer ka naam bohot lamba hai (max 120)");

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .max(254, "Email bohot lamba hai")
    .pipe(z.email("Sahi email daaliye")),
  password: z
    .string()
    .min(1, "Password zaroori hai")
    .max(128, "Password bohot lamba hai"),
});

/** The fare and kharch amounts, as whole non-negative rupees. */
const fareSchema = z
  .number()
  .int("Kiraya poore rupaye mein hona chahiye")
  .min(0, "Kiraya 0 ya usse zyada hona chahiye")
  .max(
    MAX_FARE_INR,
    `Kiraya ₹${MAX_FARE_INR.toLocaleString("en-IN")} se zyada nahi ho sakta`,
  );

const kharchSchema = z
  .number()
  .int("Kharch poore rupaye mein hona chahiye")
  .min(0, "Kharch 0 ya usse zyada hona chahiye")
  .max(
    MAX_KHARCH_INR,
    `Kharch ₹${MAX_KHARCH_INR.toLocaleString("en-IN")} se zyada nahi ho sakta`,
  );

/**
 * Every trip field, with no defaults applied.
 *
 * Both the create and the edit schema are built from this one map so a rule
 * can never be tightened in one place and forgotten in the other. The create
 * schema adds the kharch default on top; the edit schema must not, or a
 * partial update would quietly reset the kharch of trips that never sent one.
 */
const tripFields = {
  tripDate: dateOnlySchema,
  fromLocation: locationSchema("Kahan se"),
  toLocation: locationSchema("Kahan tak"),
  fare: fareSchema,
  kharch: kharchSchema,
  customerName: customerNameSchema,
  customerPhone: customerPhonesSchema,
};

export const tripCreateSchema = z.object({
  ...tripFields,
  // Optional: a trip without extra expenses is stored as zero.
  kharch: kharchSchema.default(0),
});

/**
 * A partial trip, for editing.
 *
 * Every field is optional so the driver can change just the fare, or just
 * the phone numbers, but at least one field has to change: an update that
 * touches nothing is a client bug, not an edit.
 */
export const tripUpdateSchema = z
  .object(tripFields)
  .partial()
  .refine(
    // Absent optional fields can surface as `undefined`, so count only the
    // keys the driver actually filled in.
    (value) => Object.values(value).some((field) => field !== undefined),
    {
      message: "Kam se kam ek field badalni chahiye",
    },
  );

export const tripDateQuerySchema = z.object({
  date: dateOnlySchema,
});

const monthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Month YYYY-MM format me hona chahiye")
  .refine(isValidMonth, "Ye month sahi nahi hai");

/**
 * The trips endpoint is filtered by exactly one period: a single `date` or a
 * whole `month`. Supplying both, or neither, is rejected.
 */
export const tripsQuerySchema = z
  .object({
    date: dateOnlySchema.optional(),
    month: monthSchema.optional(),
  })
  .refine((value) => Boolean(value.date) !== Boolean(value.month), {
    message: "date ya month me se ek chahiye",
    path: ["date"],
  });

export type TripCreateInput = z.infer<typeof tripCreateSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
