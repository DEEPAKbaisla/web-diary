"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { loginAction, type LoginState } from "@/app/login/actions";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "./spinner";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    loginAction,
    null,
  );
  const router = useRouter();
  const { data: session } = useSession();

  // The page and the proxy both redirect a signed-in owner away from /login.
  // This is the last line of defence for the one case neither of them can
  // see: the router restoring a cached copy of the login page without asking
  // the server, e.g. when going back in the browser's history.
  useEffect(() => {
    if (session?.user) {
      router.replace("/trips");
    }
  }, [session, router]);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state?.error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label
          htmlFor="email"
          className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
        >
          Email
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          maxLength={254}
          placeholder="you@example.com"
          className="h-11"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label
          htmlFor="password"
          className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
        >
          Password
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
          placeholder="••••••••"
          className="h-11"
        />
      </div>

      <Button type="submit" size="lg" className="mt-1 w-full" disabled={pending}>
        {pending ? <Spinner className="size-4" /> : null}
        {pending ? "Login ho raha hai..." : "Login"}
      </Button>
    </form>
  );
}
