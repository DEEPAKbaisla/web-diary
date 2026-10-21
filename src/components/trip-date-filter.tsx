"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  loading: boolean;
};

export function TripDateFilter({ value, onChange, onSearch, loading }: Props) {
  return (
    <Card size="sm" className="sm:max-w-md">
      <CardContent className="p-4">
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch();
          }}
        >
          <div className="flex flex-1 flex-col gap-2">
            <Label
              htmlFor="trip-date"
              className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
            >
              Date
            </Label>
            <Input
              id="trip-date"
              type="date"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              required
              className="h-11"
            />
          </div>
          <Button
            type="submit"
            size="lg"
            className="sm:w-36"
            disabled={loading || !value}
          >
            {loading ? "Loading..." : "Dikhao"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
