/**
 * Shapes returned by the trips API. Shared by the route handlers and the
 * client components so the two can never drift apart.
 */

/** A single trip, as returned by the API. */
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

/** Response of `GET /api/trips?date=YYYY-MM-DD`. */
export type TripResponse = {
  date: string;
  count: number;
  totalFare: number;
  trips: TripDto[];
};

/** One day's group inside a monthly report. */
export type TripDayGroup = {
  date: string;
  count: number;
  totalFare: number;
  trips: TripDto[];
};

/** Response of `GET /api/trips?month=YYYY-MM`. */
export type MonthlyResponse = {
  period: string;
  count: number;
  totalFare: number;
  days: TripDayGroup[];
};
