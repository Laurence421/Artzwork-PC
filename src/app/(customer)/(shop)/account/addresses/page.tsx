import type { Metadata } from "next";
import { Suspense } from "react";
import { AddressBook } from "@/features/customer/components/account-forms";
import { listAddresses } from "@/features/customer/queries/account";

export const metadata: Metadata = { title: "Addresses · Artzwork PC" };

export default function AddressesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Addresses />
    </Suspense>
  );
}

async function Addresses() {
  return <AddressBook addresses={await listAddresses()} />;
}
