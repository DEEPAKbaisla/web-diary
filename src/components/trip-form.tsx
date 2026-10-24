"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Spinner } from "./spinner";
import {
  TripFields,
  emptyTripForm,
  validateTripForm,
  type TripFormValues,
} from "./trip-fields";

type Status =
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | null;

export function TripForm() {
  const [form, setForm] = useState<TripFormValues>(emptyTripForm);
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
      const response = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(validated.values),
      });
      const json = await response.json();

      if (!response.ok) {
        setStatus({
          type: "error",
          message: json?.error?.message ?? "Trip save nahi ho paya.",
        });
        return;
      }

      setForm(emptyTripForm());
      setStatus({ type: "success", message: "Trip save ho gayi!" });
    } catch {
      setStatus({
        type: "error",
        message: "Trip save nahi ho paya. Phir koshish karein.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const statusClass =
    status?.type === "success"
      ? "border-emerald-700/30 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300"
      : "border-destructive/30 bg-destructive/10 text-destructive";

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2"
    >
      {status ? (
        <p
          role="status"
          className={cn(
            "rounded-lg border px-3 py-2.5 text-sm sm:col-span-2",
            statusClass,
          )}
        >
          {status.message}
        </p>
      ) : null}

      <TripFields
        form={form}
        fieldErrors={fieldErrors}
        onChange={update}
        idPrefix="new-trip"
      />

      <div className="sm:col-span-2">
        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? <Spinner className="size-4" /> : null}
          {submitting ? "Saving..." : "Trip Save Karein"}
        </Button>
      </div>
    </form>
  );
}
