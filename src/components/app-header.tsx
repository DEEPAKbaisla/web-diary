import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "./logout-button";

export function AppHeader() {
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/trips" className="text-lg font-semibold tracking-tight">
          Taxi Trip Diary
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
