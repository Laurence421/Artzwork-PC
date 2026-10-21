import type { Metadata } from "next";
import { ForgotPasswordScreen } from "@/features/shared/auth/auth-screens";

export const metadata: Metadata = { title: "Forgot password · Artzwork PC" };

export default function CustomerForgotPasswordPage() {
  return <ForgotPasswordScreen />;
}
