export type TripDto = {
  id: string;
  tripDate: string;
  fromLocation: string;
  toLocation: string;
  fare: number;
  customerName: string;
  customerPhone: string;
  createdAt: string;
};

export type TripResponse = {
  date: string;
  count: number;
  totalFare: number;
  trips: TripDto[];
};

function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDay(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  return date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function TripList({ data }: { data: TripResponse }) {
  if (data.trips.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-card/60 px-4 py-12 text-center text-sm text-muted-foreground">
        Is date ki koi trip nahi mili.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border border-border bg-muted/50 px-4 py-3">
        <p className="text-sm">
          <span className="font-mono font-semibold tabular-nums">
            {data.count}
          </span>{" "}
          {data.count === 1 ? "trip" : "trips"}{" "}
          <span className="text-muted-foreground">
            · {formatDay(data.date)}
          </span>
        </p>
        <p className="font-heading text-base font-semibold tabular-nums">
          Total kiraya: {formatCurrency(data.totalFare)}
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {data.trips.map((trip) => (
          <li key={trip.id}>
            <div className="flex overflow-hidden rounded-xl border border-border bg-card shadow-diary">
              <div className="flex w-[4.25rem] shrink-0 flex-col items-center justify-center gap-1 border-r border-border/70 bg-muted/50 px-2 py-4">
                <span className="font-mono text-sm font-semibold tabular-nums">
                  {formatTime(trip.createdAt)}
                </span>
                <span className="font-mono text-[0.58rem] uppercase tracking-[0.18em] text-muted-foreground">
                  entry
                </span>
              </div>

              <div className="min-w-0 flex-1 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="min-w-0 font-heading text-base font-semibold leading-snug">
                    <span>{trip.fromLocation}</span>
                    <span className="mx-1.5 text-muted-foreground">→</span>
                    <span>{trip.toLocation}</span>
                  </h3>
                  <p className="shrink-0 font-mono text-base font-semibold tabular-nums">
                    {formatCurrency(trip.fare)}
                  </p>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="text-foreground/80">{trip.customerName}</span>
                  <span className="font-mono tabular-nums">
                    {trip.customerPhone}
                  </span>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
