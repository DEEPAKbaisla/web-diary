import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "./logout-button";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-20 border-b-2 border-border/80 bg-card/90 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <Link
          href="/trips"
          className="flex items-baseline gap-2.5 font-heading text-lg font-semibold tracking-tight"
        >
          Taxi Trip Diary
          <span className="hidden text-[0.62rem] font-sans font-medium uppercase tracking-[0.22em] text-muted-foreground sm:inline">
            Logbook
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="secondary">
            <Link href="/trips/new">+ Naya Trip</Link>
          </Button>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
