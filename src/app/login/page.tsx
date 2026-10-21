import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) {
    redirect("/trips");
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="border-b border-border/70 px-6 py-5">
            <p className="text-[0.66rem] font-medium uppercase tracking-[0.24em] text-muted-foreground">
              Private Logbook
            </p>
            <CardTitle className="mt-1.5 font-heading text-2xl font-semibold">
              Taxi Trip Diary
            </CardTitle>
            <CardDescription className="mt-1.5">
              Sirf aapke liye. Login karke apni trips likhein.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 py-6">
            <LoginForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
