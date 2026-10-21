import type { Metadata } from "next";
import { LoginScreen } from "@/features/shared/auth/auth-screens";
import { SellerLogo } from "@/features/seller/components/seller-logo";
import { AuthLink } from "@/features/shared/ui/auth-shell";

export const metadata: Metadata = { title: "Seller login · Artzwork PC" };

// Served at /login on the seller site (the proxy maps it to /seller/login).
export default function SellerLoginPage({ searchParams }: PageProps<"/seller/login">) {
  return (
    <LoginScreen
      title="Log in"
      subtitle="Manage your shop."
      footer={<>First time here? <AuthLink href="/signup">Create the owner account</AuthLink></>}
      searchParams={searchParams}
      brand={<SellerLogo />}
    />
  );
}
