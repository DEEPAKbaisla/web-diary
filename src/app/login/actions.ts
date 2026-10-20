"use server";

import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { loginSchema } from "@/lib/validations";
import { hashPassword } from "@/lib/password";

export type LoginState = { error?: string } | null;

/** Generic message that does not reveal whether an account exists. */
const GENERIC_LOGIN_ERROR = "Login nahi ho paya. Email ya password galat hai.";
const RATE_LIMIT_ERROR =
  "Bohot zyada login attempts. Thodi der baad phir koshish karein.";

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Kripya sahi email aur password daaliye." };
  }

  const { email, password } = parsed.data;

  try {
    const result = await auth.api.signInEmail({ body: { email, password } });
    if (!result?.user) {
      return { error: GENERIC_LOGIN_ERROR };
    }
  } catch (error) {
    if (error instanceof APIError && error.status === "TOO_MANY_REQUESTS") {
      return { error: RATE_LIMIT_ERROR };
    }
    // Perform a dummy Argon2id hash so a missing account and a wrong password
    // take a similar amount of time (mitigates user-enumeration via timing).
    await hashPassword("timing-equalization-dummy-password");
    return { error: GENERIC_LOGIN_ERROR };
  }

  redirect("/trips");
}
