import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) {
    redirect("/trips");
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Taxi Trip Diary</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Apna private trip diary. Pehle login karein.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
