import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function TripList({ data }: { data: TripResponse }) {
  if (data.trips.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
        Is date ki koi trip nahi mili.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-4 py-3">
        <p className="text-sm">
          <span className="font-medium">{data.count}</span>{" "}
          {data.count === 1 ? "trip" : "trips"} · {data.date}
        </p>
        <p className="text-sm">
          Total kiraya:{" "}
          <span className="font-semibold">
            {formatCurrency(data.totalFare)}
          </span>
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {data.trips.map((trip) => (
          <li key={trip.id}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {trip.fromLocation} → {trip.toLocation}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1 text-sm">
                <p>
                  <span className="text-muted-foreground">Kiraya:</span>{" "}
                  <span className="font-semibold">
                    {formatCurrency(trip.fare)}
                  </span>
                </p>
                <p>
                  <span className="text-muted-foreground">Customer:</span>{" "}
                  {trip.customerName}
                </p>
                <p>
                  <span className="text-muted-foreground">Mobile:</span>{" "}
                  {trip.customerPhone}
                </p>
                <p className="text-xs text-muted-foreground">
                  Record: {formatDateTime(trip.createdAt)}
                </p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
