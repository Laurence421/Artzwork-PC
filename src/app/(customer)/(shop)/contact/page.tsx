import type { Metadata } from "next";
import { ContactContent } from "@/features/customer/components/shop-branding";

export const metadata: Metadata = { title: "Contact · Artzwork PC" };

export default function ContactPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <ContactContent />
    </main>
  );
}
