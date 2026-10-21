import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { TripForm } from "@/components/trip-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function NewTripPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-8">
        <Link
          href="/trips"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Diary par wapas
        </Link>

        <Card className="mt-4">
          <CardHeader className="border-b border-border/70 px-5 py-4 sm:px-6">
            <p className="text-[0.66rem] font-medium uppercase tracking-[0.24em] text-muted-foreground">
              New Entry
            </p>
            <CardTitle className="mt-1 font-heading text-xl font-semibold">
              Naya Trip
            </CardTitle>
            <CardDescription className="mt-1">
              Apni trip ka record banayein. Saare fields bharne hain.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-5 py-6 sm:px-6">
            <TripForm />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
