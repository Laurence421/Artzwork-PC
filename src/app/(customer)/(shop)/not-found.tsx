import Link from "next/link";
import { buttonClasses } from "@/features/shared/ui/button-styles";

// Shown inside the shop (with its nav bar) when a product or order link finds nothing.
// Addresses that match no page at all use src/app/not-found.tsx.
export default function ShopNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-sm text-muted">We couldn&apos;t find that product or order. It may have been removed, or the link is incomplete.</p>
      </header>
      <Link href="/" className={buttonClasses("sm")}>
        Back to the shop
      </Link>
    </main>
  );
}
