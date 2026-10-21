"use client";

import { useState } from "react";
import { tripCreateSchema, MAX_FARE_INR } from "@/lib/validations";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "./spinner";

type FormState = {
  tripDate: string;
  fromLocation: string;
  toLocation: string;
  fare: string;
  customerName: string;
  customerPhone: string;
};

type Status =
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | null;

function todayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function emptyForm(): FormState {
  return {
    tripDate: todayIso(),
    fromLocation: "",
    toLocation: "",
    fare: "",
    customerName: "",
    customerPhone: "",
  };
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

export function TripForm() {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>(null);
  const [submitting, setSubmitting] = useState(false);

  function update(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function validate(): boolean {
    const parsed = tripCreateSchema.safeParse({
      ...form,
      fare: form.fare === "" ? Number.NaN : Number(form.fare),
    });

    if (parsed.success) {
      setFieldErrors({});
      return true;
    }

    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]?.toString();
      if (key && !errors[key]) {
        errors[key] = issue.message;
      }
    }
    setFieldErrors(errors);
    return false;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setStatus(null);

    if (!validate()) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          tripDate: form.tripDate,
          fromLocation: form.fromLocation,
          toLocation: form.toLocation,
          fare: Number(form.fare),
          customerName: form.customerName,
          customerPhone: form.customerPhone,
        }),
      });
      const json = await response.json();

      if (!response.ok) {
        setStatus({
          type: "error",
          message: json?.error?.message ?? "Trip save nahi ho paya.",
        });
        return;
      }

      setForm(emptyForm());
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

      <Field id="tripDate" label="Date" error={fieldErrors.tripDate}>
        <Input
          id="tripDate"
          type="date"
          value={form.tripDate}
          onChange={(event) => update("tripDate", event.target.value)}
          required
          aria-invalid={Boolean(fieldErrors.tripDate)}
          className="h-11"
        />
      </Field>

      <Field id="fare" label="Kiraya (₹)" error={fieldErrors.fare}>
        <Input
          id="fare"
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_FARE_INR}
          step={1}
          value={form.fare}
          onChange={(event) => update("fare", event.target.value)}
          placeholder="e.g. 250"
          required
          autoComplete="off"
          aria-invalid={Boolean(fieldErrors.fare)}
          className="h-11 font-mono tabular-nums"
        />
      </Field>

      <Field
        id="fromLocation"
        label="Kahan se"
        error={fieldErrors.fromLocation}
      >
        <Input
          id="fromLocation"
          value={form.fromLocation}
          onChange={(event) => update("fromLocation", event.target.value)}
          placeholder="e.g. Connaught Place"
          maxLength={200}
          required
          autoComplete="off"
          aria-invalid={Boolean(fieldErrors.fromLocation)}
          className="h-11"
        />
      </Field>

      <Field
        id="toLocation"
        label="Kahan tak"
        error={fieldErrors.toLocation}
      >
        <Input
          id="toLocation"
          value={form.toLocation}
          onChange={(event) => update("toLocation", event.target.value)}
          placeholder="e.g. India Gate"
          maxLength={200}
          required
          autoComplete="off"
          aria-invalid={Boolean(fieldErrors.toLocation)}
          className="h-11"
        />
      </Field>

      <Field
        id="customerName"
        label="Customer ka Naam"
        error={fieldErrors.customerName}
      >
        <Input
          id="customerName"
          value={form.customerName}
          onChange={(event) => update("customerName", event.target.value)}
          placeholder="e.g. Ramesh Kumar"
          maxLength={120}
          required
          autoComplete="off"
          aria-invalid={Boolean(fieldErrors.customerName)}
          className="h-11"
        />
      </Field>

      <Field
        id="customerPhone"
        label="Mobile Number"
        error={fieldErrors.customerPhone}
      >
        <Input
          id="customerPhone"
          type="tel"
          inputMode="numeric"
          value={form.customerPhone}
          onChange={(event) => update("customerPhone", event.target.value)}
          placeholder="9876543210"
          maxLength={20}
          required
          autoComplete="off"
          aria-invalid={Boolean(fieldErrors.customerPhone)}
          className="h-11 font-mono tabular-nums"
        />
      </Field>

      <div className="sm:col-span-2">
        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? <Spinner className="size-4" /> : null}
          {submitting ? "Saving..." : "Trip Save Karein"}
        </Button>
      </div>
    </form>
  );
}
