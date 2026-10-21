import type { Metadata } from "next";
import { SignupScreen } from "@/features/shared/auth/auth-screens";
import { SellerLogo } from "@/features/seller/components/seller-logo";
import { AuthLink } from "@/features/shared/ui/auth-shell";

export const metadata: Metadata = { title: "Create the owner account · Artzwork PC" };

// Served at /signup on the seller site. Any email can sign up, but only the
// configured seller email can log in here afterwards (see login and is_seller()).
export default function SellerSignupPage({ searchParams }: PageProps<"/seller/signup">) {
  return (
    <SignupScreen
      title="Create the owner account"
      subtitle="Use the shop owner's email."
      footer={<>Already set up? <AuthLink href="/login">Log in</AuthLink></>}
      searchParams={searchParams}
      brand={<SellerLogo />}
    />
  );
}
