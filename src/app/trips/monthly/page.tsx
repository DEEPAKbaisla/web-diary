import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { MonthlyReport } from "@/components/monthly-report";

export default async function MonthlyPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-8">
      <p className="text-[0.66rem] font-medium uppercase tracking-[0.24em] text-muted-foreground">
        Monthly Report
      </p>
      <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight">
        Mahine ka Hisaab
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Mahine ki saari trips aur unka total.
      </p>
      <div className="mt-5">
        <MonthlyReport />
      </div>
    </main>
  );
}
