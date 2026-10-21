import { Skeleton } from "@/components/ui/skeleton";

export default function LoginLoading() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-diary">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-3 h-7 w-52" />
        <Skeleton className="mt-3 h-4 w-full" />
        <Skeleton className="mt-7 h-11 w-full" />
        <Skeleton className="mt-4 h-11 w-full" />
        <Skeleton className="mt-6 h-11 w-full" />
      </div>
    </main>
  );
}
