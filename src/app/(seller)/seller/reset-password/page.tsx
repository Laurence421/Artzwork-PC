import type { Metadata } from "next";
import { SellerLogo } from "@/features/seller/components/seller-logo";
import { ResetPasswordScreen } from "@/features/shared/auth/auth-screens";

export const metadata: Metadata = { title: "Set a new password · Artzwork PC" };

// Served at /reset-password on the seller site, opened from the reset email.
export default function SellerResetPasswordPage() {
  return <ResetPasswordScreen brand={<SellerLogo />} />;
}
