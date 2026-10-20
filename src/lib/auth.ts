import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { nextCookies } from "better-auth/next-js";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { prisma } from "./prisma";
import { hashPassword, verifyPassword } from "./password";
import { checkRateLimit, rateLimitKey } from "./rate-limit";
import { extractClientIp } from "./client-ip";

const isProduction = process.env.NODE_ENV === "production";
const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

const trustedOrigins = [baseURL];
for (const origin of (process.env.TRUSTED_ORIGINS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean)) {
  trustedOrigins.push(origin);
}

function loginRateLimitConfig() {
  const max = Number.parseInt(process.env.LOGIN_RATE_LIMIT_MAX ?? "", 10);
  const windowSeconds = Number.parseInt(
    process.env.LOGIN_RATE_LIMIT_WINDOW_SECONDS ?? "",
    10,
  );
  return {
    max: Number.isFinite(max) && max > 0 ? max : 10,
    windowSeconds:
      Number.isFinite(windowSeconds) && windowSeconds > 0 ? windowSeconds : 60,
  };
}

/**
 * Better Auth instance for the single-owner Taxi Trip Diary app.
 *
 * - Email + password only. Public sign-up is disabled (`disableSignUp: true`);
 *   the owner account is provisioned once by `scripts/create-owner.ts`.
 * - Passwords are hashed with Argon2id.
 * - Sessions are database-backed with a 7 day lifetime.
 * - The `nextCookies` plugin lets server actions set the session cookie.
 */
export const auth = betterAuth({
  appName: "Taxi Trip Diary",
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    password: {
      hash: hashPassword,
      verify: verifyPassword,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh at most once a day
  },
  // Rate limiting for the rest of the auth surface is handled by our own
  // PostgreSQL-backed limiter (see src/lib/rate-limit.ts). The sign-in path is
  // additionally guarded by the `before` hook below.
  rateLimit: {
    enabled: false,
  },
  hooks: {
    /**
     * Rate-limit every sign-in attempt by IP *and* by the account identifier.
     *
     * This lives inside Better Auth on purpose: it covers the login form AND
     * any direct call to `/api/auth/sign-in/email`, so the limiter cannot be
     * bypassed by hitting the auth endpoint directly.
     */
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email") return;

      const body = (ctx.body ?? {}) as { email?: unknown };
      const email =
        typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const ip = ctx.headers ? extractClientIp(ctx.headers) : "unknown";
      const { max, windowSeconds } = loginRateLimitConfig();

      const [accountLimit, ipLimit] = await Promise.all([
        checkRateLimit(
          rateLimitKey({ scope: "login-account", identifier: email }),
          max,
          windowSeconds,
        ),
        checkRateLimit(
          rateLimitKey({ scope: "login-ip", identifier: ip }),
          max,
          windowSeconds,
        ),
      ]);

      if (!accountLimit.ok || !ipLimit.ok) {
        throw new APIError("TOO_MANY_REQUESTS", {
          message: "Too many login attempts. Please try again later.",
        });
      }
    }),
  },
  advanced: {
    useSecureCookies: isProduction,
    defaultCookieAttributes: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
    },
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
export type SessionUser = Session["user"];
