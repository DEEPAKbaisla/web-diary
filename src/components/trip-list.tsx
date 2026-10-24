import { TripEntry } from "./trip-entry";
import { TripEditForm } from "./trip-edit-form";
import { formatCurrency, formatDay } from "@/lib/format";
import type { TripDto, TripResponse } from "@/lib/trip-types";

export function TripList({
  data,
  editingId,
  onEdit,
  onCancelEdit,
  onSaved,
}: {
  data: TripResponse;
  /** The trip whose row is currently an open editor, if any. */
  editingId: string | null;
  onEdit: (id: string) => void;
  onCancelEdit: () => void;
  /** Called with the trip as the server now has it. */
  onSaved: (trip: TripDto) => void;
}) {
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
            {editingId === trip.id ? (
              <TripEditForm
                trip={trip}
                onSaved={onSaved}
                onCancel={onCancelEdit}
              />
            ) : (
              <TripEntry trip={trip} onEdit={() => onEdit(trip.id)} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
