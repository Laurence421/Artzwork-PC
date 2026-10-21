import type { Metadata } from "next";
import { Suspense } from "react";
import { CustomerPasswordForm, DeleteAccountForm, ProfileForm } from "@/features/customer/components/account-forms";
import { requireCustomer } from "@/features/customer/queries/account";

export const metadata: Metadata = { title: "Profile · Artzwork PC" };

export default function ProfilePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Profile />
    </Suspense>
  );
}

async function Profile() {
  const { user } = await requireCustomer("/account/profile");
  return (
    <>
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-base font-semibold">Your details</h2>
        <ProfileForm name={user.name} phone={user.phone} />
      </section>
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-base font-semibold">Password</h2>
        <CustomerPasswordForm hasPassword={user.hasPassword} />
      </section>
      <section className="flex flex-col gap-4 rounded-xl border border-danger/30 bg-surface p-6">
        <h2 className="text-base font-semibold">Delete account</h2>
        <DeleteAccountForm />
      </section>
    </>
  );
}
