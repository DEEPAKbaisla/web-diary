import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** A small spinning indicator for in-place loading. */
export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2
      aria-hidden="true"
      className={cn("size-4 animate-spin", className)}
    />
  );
}
