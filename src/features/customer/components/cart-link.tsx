"use client";

import Link from "next/link";
import { secondaryButtonClasses } from "@/features/shared/ui/button-styles";
import { useCart } from "../cart/cart-store";

/** "Cart" with the item count, in the shop nav bar. */
export function CartLink() {
  const { count } = useCart();
  return (
    <Link href="/cart" className={`${secondaryButtonClasses("sm")} gap-2`} aria-label={`Cart, ${count} ${count === 1 ? "item" : "items"}`}>
      Cart
      {count > 0 && (
        <span className="min-w-5 rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular-nums">
          {count}
        </span>
      )}
    </Link>
  );
}
