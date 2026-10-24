"use client";

import { tripCreateSchema, MAX_FARE_INR, MAX_KHARCH_INR } from "@/lib/validations";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Every field of a trip, as the driver types them: strings only. */
export type TripFormValues = {
  tripDate: string;
  fromLocation: string;
  toLocation: string;
  fare: string;
  kharch: string;
  customerName: string;
  customerPhone: string;
};

function todayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** The create form's starting point: today, everything else blank. */
export function emptyTripForm(): TripFormValues {
  return {
    tripDate: todayIso(),
    fromLocation: "",
    toLocation: "",
    fare: "",
    kharch: "",
    customerName: "",
    customerPhone: "",
  };
}

/**
 * Validates the raw form strings against the create schema.
 *
 * Returns either the parsed payload ready to send, or the per-field messages
 * to show. Both the new-trip page and the inline editor use this, so a trip
 * is accepted or rejected identically wherever it was typed.
 */
export function validateTripForm(
  form: TripFormValues,
):
  | { ok: true; values: ReturnType<typeof tripCreateSchema.parse> }
  | { ok: false; errors: Record<string, string> } {
  const parsed = tripCreateSchema.safeParse({
    ...form,
    fare: form.fare === "" ? Number.NaN : Number(form.fare),
    // An empty kharch box means the trip had no extra expenses.
    kharch: form.kharch === "" ? 0 : Number(form.kharch),
  });

  if (parsed.success) {
    return { ok: true, values: parsed.data };
  }

  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0]?.toString();
    if (key && !errors[key]) {
      errors[key] = issue.message;
    }
  }
  return { ok: false, errors };
}

function Field({
  id,
  label,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label
        htmlFor={id}
        className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
      >
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive" aria-live="polite">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The seven trip inputs, shared by the new-trip page and the inline editor.
 *
 * The field ids are prefixed per form so a diary that shows an open editor
 * next to nothing else never renders two inputs with the same id.
 */
export function TripFields({
  form,
  fieldErrors,
  onChange,
  idPrefix,
}: {
  form: TripFormValues;
  fieldErrors: Record<string, string>;
  onChange: (field: keyof TripFormValues, value: string) => void;
  idPrefix: string;
}) {
  const id = (field: keyof TripFormValues) => `${idPrefix}-${field}`;

  return (
    <>
      <Field id={id("tripDate")} label="Date" error={fieldErrors.tripDate}>
        <Input
          id={id("tripDate")}
          type="date"
          value={form.tripDate}
          onChange={(event) => onChange("tripDate", event.target.value)}
          required
          aria-invalid={Boolean(fieldErrors.tripDate)}
          className="h-11"
        />
      </Field>

      <Field id={id("fare")} label="Kiraya (₹)" error={fieldErrors.fare}>
        <Input
          id={id("fare")}
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_FARE_INR}
          step={1}
          value={form.fare}
          onChange={(event) => onChange("fare", event.target.value)}
          placeholder="e.g. 250"
          required
          autoComplete="off"
          aria-invalid={Boolean(fieldErrors.fare)}
          className="h-11 font-mono tabular-nums"
        />
      </Field>

      <Field id={id("kharch")} label="Kharch (₹)" error={fieldErrors.kharch}>
        <Input
          id={id("kharch")}
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_KHARCH_INR}
          step={1}
          value={form.kharch}
          onChange={(event) => onChange("kharch", event.target.value)}
          placeholder="e.g. 50"
          autoComplete="off"
          aria-invalid={Boolean(fieldErrors.kharch)}
          className="h-11 font-mono tabular-nums"
        />
      </Field>

      <Field
        id={id("fromLocation")}
        label="Kahan se"
        error={fieldErrors.fromLocation}
      >
        <Input
          id={id("fromLocation")}
          value={form.fromLocation}
          onChange={(event) => onChange("fromLocation", event.target.value)}
          placeholder="e.g. Connaught Place"
          maxLength={200}
          required
          autoComplete="off"
          aria-invalid={Boolean(fieldErrors.fromLocation)}
          className="h-11"
        />
      </Field>

      <Field
        id={id("toLocation")}
        label="Kahan tak"
        error={fieldErrors.toLocation}
      >
        <Input
          id={id("toLocation")}
          value={form.toLocation}
          onChange={(event) => onChange("toLocation", event.target.value)}
          placeholder="e.g. India Gate"
          maxLength={200}
          required
          autoComplete="off"
          aria-invalid={Boolean(fieldErrors.toLocation)}
          className="h-11"
        />
      </Field>

      <Field
        id={id("customerName")}
        label="Customer ka Naam"
        error={fieldErrors.customerName}
      >
        <Input
          id={id("customerName")}
          value={form.customerName}
          onChange={(event) => onChange("customerName", event.target.value)}
          placeholder="e.g. Ramesh Kumar"
          maxLength={120}
          required
          autoComplete="off"
          aria-invalid={Boolean(fieldErrors.customerName)}
          className="h-11"
        />
      </Field>

      <Field
        id={id("customerPhone")}
        label="Mobile Number"
        error={fieldErrors.customerPhone}
      >
        <Input
          id={id("customerPhone")}
          type="tel"
          value={form.customerPhone}
          onChange={(event) => onChange("customerPhone", event.target.value)}
          placeholder="9876543210, 9812345678"
          maxLength={200}
          required
          autoComplete="off"
          aria-invalid={Boolean(fieldErrors.customerPhone)}
          className="h-11 font-mono tabular-nums"
        />
        <p className="text-xs text-muted-foreground">
          Ek se zyada number ho toh comma se alag karein. Max 5.
        </p>
      </Field>
    </>
  );
}
