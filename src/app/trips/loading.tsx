import { Skeleton } from "@/components/ui/skeleton";

export default function TripsLoading() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-8">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-3 h-8 w-56" />
      <Skeleton className="mt-3 h-4 w-72" />
      <Skeleton className="mt-6 h-24 w-full rounded-xl" />
      <div className="mt-4 flex flex-col gap-3">
        {["one", "two", "three"].map((key) => (
          <Skeleton key={key} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    </main>
  );
}
