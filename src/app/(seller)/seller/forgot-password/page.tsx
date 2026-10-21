import type { Metadata } from "next";
import { SellerLogo } from "@/features/seller/components/seller-logo";
import { ForgotPasswordScreen } from "@/features/shared/auth/auth-screens";

export const metadata: Metadata = { title: "Forgot password · Artzwork PC" };

// Served at /forgot-password on the seller site.
export default function SellerForgotPasswordPage() {
  return <ForgotPasswordScreen brand={<SellerLogo />} />;
}
