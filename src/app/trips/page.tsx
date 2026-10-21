import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { TripDiary } from "@/components/trip-diary";

export default async function TripsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-8">
        <p className="text-[0.66rem] font-medium uppercase tracking-[0.24em] text-muted-foreground">
          Daily Record
        </p>
        <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight">
          Trip Diary
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kisi bhi date ki trips dekhein.
        </p>
        <div className="mt-5">
          <TripDiary />
        </div>
      </main>
    </>
  );
}
