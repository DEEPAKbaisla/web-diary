import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { TripForm } from "@/components/trip-form";

export default async function NewTripPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
        <Link
          href="/trips"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Diary par wapas
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Naya Trip</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Apni aaj ki trip ka record banayein.
        </p>
        <TripForm />
      </main>
    </>
  );
}
