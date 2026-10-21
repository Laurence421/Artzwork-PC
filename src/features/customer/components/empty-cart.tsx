import Link from "next/link";
import { buttonClasses } from "@/features/shared/ui/button-styles";

/** Shown on the cart and checkout when there is nothing in the cart. */
export function EmptyCart() {
  return (
    <div className="flex flex-col items-start gap-4 rounded-2xl border border-border bg-surface p-6">
      <p className="text-sm text-muted">Your cart is empty.</p>
      <Link href="/" className={buttonClasses("sm")}>
        Browse products
      </Link>
    </div>
  );
}
