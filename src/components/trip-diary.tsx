"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TripDateFilter } from "./trip-date-filter";
import { TripList, type TripResponse } from "./trip-list";

function todayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function TripDiary() {
  const [date, setDate] = useState<string>(() => todayIso());
  const [data, setData] = useState<TripResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialDate = useRef(date);

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

  useEffect(() => {
    void search(initialDate.current);
  }, [search]);

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

      {data ? <TripList data={data} /> : null}
    </div>
  );
}
