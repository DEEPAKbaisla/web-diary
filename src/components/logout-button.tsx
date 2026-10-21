"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Spinner } from "./spinner";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    if (pending) return;
    setPending(true);
    try {
      await signOut();
      router.replace("/login");
      router.refresh();
    } catch {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleLogout}
      disabled={pending}
    >
      {pending ? <Spinner className="size-3.5" /> : null}
      {pending ? "Logging out..." : "Logout"}
    </Button>
  );
}
