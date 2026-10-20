import { createAuthClient } from "better-auth/react";

/**
 * Client-side Better Auth client. Used by client components for sign-in /
 * sign-out and to observe the session reactively.
 */
export const authClient = createAuthClient();

export const { signIn, signOut, useSession } = authClient;
