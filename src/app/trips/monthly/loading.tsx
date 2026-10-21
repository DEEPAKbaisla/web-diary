import { Skeleton } from "@/components/ui/skeleton";

export default function MonthlyLoading() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-8">
      <Skeleton className="h-3 w-32" />
      <Skeleton className="mt-3 h-8 w-64" />
      <Skeleton className="mt-3 h-4 w-72" />
      <Skeleton className="mt-6 h-16 w-full rounded-xl" />
      <Skeleton className="mt-4 h-14 w-full rounded-xl" />
      <div className="mt-4 flex flex-col gap-3">
        {["one", "two"].map((key) => (
          <Skeleton key={key} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    </main>
  );
}
