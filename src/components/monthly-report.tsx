"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TripEntry } from "./trip-entry";
import { Spinner } from "./spinner";
import { formatCurrency, formatDay } from "@/lib/format";
import { formatMonthLabel, shiftMonth } from "@/lib/validations";
import { cn } from "@/lib/utils";
import type { MonthlyResponse } from "@/lib/trip-types";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function MonthlyReport() {
  const [month, setMonth] = useState<string>(() => currentMonth());
  const [data, setData] = useState<MonthlyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards against a slow earlier response overwriting a newer one when the
  // driver clicks the arrows quickly.
  const latestRequest = useRef(0);

  const load = useCallback(async (selected: string) => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/trips?month=${encodeURIComponent(selected)}`,
        { credentials: "include" },
      );
      const json = await response.json();
      if (requestId !== latestRequest.current) return;
      if (!response.ok) {
        throw new Error(
          json?.error?.message ?? "Report load nahi ho payi.",
        );
      }
      setData(json.data as MonthlyResponse);
    } catch (err) {
      if (requestId !== latestRequest.current) return;
      setData(null);
      setError(
        err instanceof Error ? err.message : "Report load nahi ho payi.",
      );
    } finally {
      if (requestId === latestRequest.current) {
        setLoading(false);
      }
    }
  }, []);

  const initialMonth = useRef(month);

  useEffect(() => {
    void load(initialMonth.current);
  }, [load]);

  // Month changes are driven from the arrow buttons rather than from an
  // effect, so the list reloads exactly once per click.
  function goToMonth(next: string) {
    setMonth(next);
    void load(next);
  }

  const thisMonth = currentMonth();
  const firstLoad = loading && !data;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2.5 shadow-diary">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-10"
          onClick={() => goToMonth(shiftMonth(month, -1))}
          disabled={loading}
          aria-label="Pichhla mahina"
        >
          <ChevronLeft className="size-4" />
        </Button>

        <p
          className="flex min-w-0 flex-1 items-center justify-center gap-2 text-center font-heading text-lg font-semibold tracking-tight"
          aria-live="polite"
        >
          {loading ? <Spinner className="size-3.5 shrink-0" /> : null}
          <span className="truncate">{formatMonthLabel(month)}</span>
        </p>

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-10"
          onClick={() => goToMonth(shiftMonth(month, 1))}
          disabled={loading}
          aria-label="Agla mahina"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => goToMonth(thisMonth)}
          disabled={loading || month === thisMonth}
        >
          {loading ? <Spinner className="size-3.5" /> : null}
          Is mahine
        </Button>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div
        aria-busy={loading}
        className={cn(
          "flex flex-col gap-4 transition-opacity duration-200",
          loading && data && "pointer-events-none opacity-50",
        )}
      >
        {firstLoad ? <MonthlySkeleton /> : null}

        {data ? <MonthlySummary data={data} /> : null}

        {data && data.days.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card/60 px-4 py-12 text-center text-sm text-muted-foreground">
            Is mahine ki koi trip nahi mili.
          </p>
        ) : null}

        {data && data.days.length > 0 ? (
          <div className="flex flex-col gap-6">
            {data.days.map((day) => (
              <section key={day.date} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border/70 pb-2">
                  <Link
                    href={`/trips?date=${day.date}`}
                    className="font-heading text-base font-semibold tracking-tight hover:underline"
                  >
                    {formatDay(day.date)}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-mono font-semibold tabular-nums text-foreground/80">
                      {day.count}
                    </span>{" "}
                    {day.count === 1 ? "trip" : "trips"} ·{" "}
                    <span className="font-mono font-semibold tabular-nums text-foreground/80">
                      {formatCurrency(day.totalFare)}
                    </span>
                  </p>
                </div>

                <ul className="flex flex-col gap-3">
                  {day.trips.map((trip) => (
                    <li key={trip.id}>
                      <TripEntry trip={trip} showKharch />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MonthlySummary({ data }: { data: MonthlyResponse }) {
  // The bachat is what is left of the fare once the extra expenses are taken
  // out. It is only worth showing when there actually were extra expenses.
  const bachat = data.totalFare - data.totalKharch;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border border-border bg-muted/50 px-4 py-3">
      <p className="text-sm">
        <span className="font-mono font-semibold tabular-nums">
          {data.count}
        </span>{" "}
        {data.count === 1 ? "trip" : "trips"}
      </p>
      <div className="flex flex-col items-end gap-0.5">
        <p className="font-heading text-base font-semibold tabular-nums">
          Total kiraya: {formatCurrency(data.totalFare)}
        </p>
        {data.totalKharch > 0 ? (
          <p
            className={cn(
              "font-heading text-sm font-semibold tabular-nums",
              bachat < 0
                ? "text-destructive"
                : "text-emerald-700 dark:text-emerald-400",
            )}
          >
            Bachat: {formatCurrency(bachat)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Placeholder shown while the very first month is being fetched. */
function MonthlySkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <Skeleton className="h-14 w-full rounded-xl" />
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-xl" />
    </div>
  );
}
