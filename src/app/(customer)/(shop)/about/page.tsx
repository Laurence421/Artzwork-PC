import type { Metadata } from "next";
import { AboutContent } from "@/features/customer/components/shop-branding";

export const metadata: Metadata = { title: "About · Artzwork PC" };

export default function AboutPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <AboutContent />
    </main>
  );
}
