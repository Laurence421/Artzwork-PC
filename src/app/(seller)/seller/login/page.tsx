import type { Metadata } from "next";
import { LoginScreen } from "@/features/shared/auth/auth-screens";
import { SellerLogo } from "@/features/seller/components/seller-logo";

export const metadata: Metadata = { title: "Seller login · Artzwork PC" };

// Served at /login on the seller site (the proxy maps it to /seller/login).
export default function SellerLoginPage({ searchParams }: PageProps<"/seller/login">) {
  return (
    <LoginScreen
      title="Log in"
      subtitle="Manage your shop."
      footer={<>Only the shop owner can log in here.</>}
      searchParams={searchParams}
      brand={<SellerLogo />}
    />
  );
}
