import "server-only";
import { cookies } from "next/headers";

/** Where the reset email's link leads (through /auth/confirm). */
export const RESET_PATH = "/reset-password";

/**
 * Set by /auth/confirm only after a real reset link checked out: the user id, for 15 minutes.
 * "Set a new password" works only with it, so a device that is merely signed in can't change
 * the password without the email.
 */
export const RESET_COOKIE = "pw_reset";

export async function resetAllowedFor(userId: string | undefined) {
  if (!userId) return false;
  return (await cookies()).get(RESET_COOKIE)?.value === userId;
}

export async function clearResetCookie() {
  (await cookies()).delete(RESET_COOKIE);
}
