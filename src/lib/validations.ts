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

/** Returns the 10-digit Indian mobile number, or null when invalid. */
export function normalizeIndianMobile(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  if (digits.length === 10 && /^[6-9]/.test(digits)) return digits;
  return null;
}

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

const indianMobileSchema = z
  .string()
  .trim()
  .min(1, "Mobile number zaroori hai")
  .max(20, "Mobile number bohot lamba hai")
  .superRefine((value, ctx) => {
    if (!normalizeIndianMobile(value)) {
      ctx.addIssue({
        code: "custom",
        message: "Sahi Indian mobile number daaliye (10 digits)",
      });
    }
  })
  .transform((value) => normalizeIndianMobile(value) as string);

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

export const tripCreateSchema = z.object({
  tripDate: dateOnlySchema,
  fromLocation: locationSchema("Kahan se"),
  toLocation: locationSchema("Kahan tak"),
  fare: z
    .number()
    .int("Kiraya poore rupaye mein hona chahiye")
    .min(0, "Kiraya 0 ya usse zyada hona chahiye")
    .max(
      MAX_FARE_INR,
      `Kiraya ₹${MAX_FARE_INR.toLocaleString("en-IN")} se zyada nahi ho sakta`,
    ),
  kharch: z
    .number()
    .int("Kharch poore rupaye mein hona chahiye")
    .min(0, "Kharch 0 ya usse zyada hona chahiye")
    .max(
      MAX_KHARCH_INR,
      `Kharch ₹${MAX_KHARCH_INR.toLocaleString("en-IN")} se zyada nahi ho sakta`,
    )
    // Optional: a trip without extra expenses is stored as zero.
    .default(0),
  customerName: customerNameSchema,
  customerPhone: indianMobileSchema,
});

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
