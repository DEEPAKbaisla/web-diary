"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "./spinner";
import {
  TripFields,
  validateTripForm,
  type TripFormValues,
} from "./trip-fields";
import type { TripDto } from "@/lib/trip-types";

type Status = { type: "error"; message: string } | null;

/** The trip as editable strings, ready to drop into the shared fields. */
function toFormValues(trip: TripDto): TripFormValues {
  return {
    tripDate: trip.tripDate,
    fromLocation: trip.fromLocation,
    toLocation: trip.toLocation,
    fare: String(trip.fare),
    // An empty kharch box and a stored zero mean the same thing.
    kharch: trip.kharch === 0 ? "" : String(trip.kharch),
    customerName: trip.customerName,
    customerPhone: trip.customerPhone,
  };
}

/**
 * Edits one trip in place, inside its own row of the day diary.
 *
 * Every field is prefilled from the trip and every field is editable; the
 * whole form is sent back, so a save always leaves the trip complete rather
 * than half-merged.
 */
export function TripEditForm({
  trip,
  onSaved,
  onCancel,
}: {
  trip: TripDto;
  /** Called with the trip as the server now has it. */
  onSaved: (trip: TripDto) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<TripFormValues>(() => toFormValues(trip));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>(null);
  const [submitting, setSubmitting] = useState(false);

  function update(field: keyof TripFormValues, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setStatus(null);

    const validated = validateTripForm(form);
    if (!validated.ok) {
      setFieldErrors(validated.errors);
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    try {
      const response = await fetch(
        `/api/trips/${encodeURIComponent(trip.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(validated.values),
        },
      );
      const json = await response.json();

      if (!response.ok) {
        setStatus({
          type: "error",
          message: json?.error?.message ?? "Trip update nahi ho payi.",
        });
        return;
      }

      onSaved(json.data as TripDto);
    } catch {
      setStatus({
        type: "error",
        message: "Trip update nahi ho payi. Phir koshish karein.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="grid grid-cols-1 gap-x-5 gap-y-5 rounded-xl border border-border bg-card p-4 shadow-diary sm:grid-cols-2"
    >
      <div className="sm:col-span-2">
        <p className="text-[0.66rem] font-medium uppercase tracking-[0.24em] text-muted-foreground">
          Trip Edit Karein
        </p>
      </div>

      {status ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive sm:col-span-2"
        >
          {status.message}
        </p>
      ) : null}

      <TripFields
        form={form}
        fieldErrors={fieldErrors}
        onChange={update}
        idPrefix={`edit-${trip.id}`}
      />

      <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row-reverse">
        <Button type="submit" size="lg" className="flex-1" disabled={submitting}>
          {submitting ? <Spinner className="size-4" /> : null}
          {submitting ? "Saving..." : "Badlaav Save Karein"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
