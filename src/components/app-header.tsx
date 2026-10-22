"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "./logout-button";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/trips", label: "Day" },
  { href: "/trips/monthly", label: "Monthly" },
] as const;

export function AppHeader() {
  const pathname = usePathname();
  const active = pathname.startsWith("/trips/monthly")
    ? "/trips/monthly"
    : "/trips";

  return (
    <header className="sticky top-0 z-20 bg-card/90 backdrop-blur-sm">
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

      <nav aria-label="Views" className="mx-auto w-full max-w-3xl px-4">
        <div className="flex gap-1 border-b border-border/80">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active === tab.href ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active === tab.href
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
