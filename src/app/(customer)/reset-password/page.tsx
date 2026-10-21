import type { Metadata } from "next";
import { ResetPasswordScreen } from "@/features/shared/auth/auth-screens";

export const metadata: Metadata = { title: "Set a new password · Artzwork PC", robots: { index: false } };

// Opened from the reset email (through /auth/confirm).
export default function CustomerResetPasswordPage() {
  return <ResetPasswordScreen />;
}
