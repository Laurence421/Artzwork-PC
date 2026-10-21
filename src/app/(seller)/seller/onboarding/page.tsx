import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { OnboardingForm } from "@/features/seller/components/onboarding-form";
import { sellerHome } from "@/features/shared/auth/destination";
import { SellerLogo } from "@/features/seller/components/seller-logo";
import { AuthShell } from "@/features/shared/ui/auth-shell";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Create your store · Artzwork PC" };

export default function OnboardingPage() {
  return (
    <AuthShell title="Create your store" brand={<SellerLogo />}>
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <SellerWithoutStore>
          <OnboardingForm />
        </SellerWithoutStore>
      </Suspense>
    </AuthShell>
  );
}

/** Only the owner, and only before the store exists. Served at /onboarding on the seller site. */
async function SellerWithoutStore({ children }: { children: React.ReactNode }) {
  const destination = await sellerHome(await createClient());
  if (destination !== "/onboarding") redirect(destination ?? "/auth/signout?error=not-owner");
  return children;
}
