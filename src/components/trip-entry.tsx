import { formatCurrency, formatTime } from "@/lib/format";
import type { TripDto } from "@/lib/trip-types";

/**
 * A single trip rendered as a ledger row: the time sits in a margin column
 * on the left, the route and customer details on the right, and the fare in
 * its own right-hand column.
 */
export function TripEntry({ trip }: { trip: TripDto }) {
  return (
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
          <span className="font-mono tabular-nums">{trip.customerPhone}</span>
        </div>
      </div>
    </div>
  );
}
