"use client";

import { useCallback, useState } from "react";
import { TripDateFilter } from "./trip-date-filter";
import { TripList } from "./trip-list";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { TripResponse } from "@/lib/trip-types";

function todayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function TripDiary({
  initialDate: requestedDate,
}: {
  initialDate?: string;
}) {
  const [date, setDate] = useState<string>(
    () => requestedDate ?? todayIso(),
  );
  const [data, setData] = useState<TripResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (selectedDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/trips?date=${encodeURIComponent(selectedDate)}`,
        { credentials: "include" },
      );
      const json = await response.json();
      if (!response.ok) {
        throw new Error(
          json?.error?.message ?? "Trips load nahi ho payi.",
        );
      }
      setData(json.data as TripResponse);
    } catch (err) {
      setData(null);
      setError(
        err instanceof Error ? err.message : "Trips load nahi ho payi.",
      );
    } finally {
      setLoading(false);
    }
  }, []);


  return (
    <div className="flex flex-col gap-4">
      <TripDateFilter
        value={date}
        onChange={setDate}
        onSearch={() => void search(date)}
        loading={loading}
      />

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
          "transition-opacity duration-200",
          loading && data && "pointer-events-none opacity-50",
        )}
      >
        {loading && !data ? <DiarySkeleton /> : null}
        {data ? <TripList data={data} /> : null}
      </div>
    </div>
  );
}

/** Placeholder shown while the very first day is being fetched. */
function DiarySkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <Skeleton className="h-14 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-xl" />
    </div>
  );
}
