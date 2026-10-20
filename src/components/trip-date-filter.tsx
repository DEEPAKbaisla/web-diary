"use client";

import { Button } from "@/components/ui/button";
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
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch();
      }}
    >
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="trip-date">Date</Label>
        <Input
          id="trip-date"
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
        />
      </div>
      <Button
        type="submit"
        size="lg"
        className="sm:w-32"
        disabled={loading || !value}
      >
        {loading ? "Loading..." : "Dikhao"}
      </Button>
    </form>
  );
}
