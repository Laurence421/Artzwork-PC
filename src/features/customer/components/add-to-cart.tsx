"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClasses, focusRingClasses, secondaryButtonClasses } from "@/features/shared/ui/button-styles";
import { FormAlert } from "@/features/shared/ui/form-alert";
import { MAX_QTY, useCart } from "../cart/cart-store";
import { QuantityPicker } from "./quantity-picker";

/** Quantity picker, "Add to cart" and "Order now" (add, then straight to checkout) on the product page. */
export function AddToCart({ productId, name, stock }: { productId: string; name: string; stock: number }) {
  const cart = useCart();
  const router = useRouter();
  const inCart = cart.items.find((i) => i.id === productId)?.qty ?? 0;
  const max = Math.max(0, Math.min(stock, MAX_QTY) - inCart);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [ordering, setOrdering] = useState(false);

  if (stock <= 0) {
    return (
      <button type="button" disabled className={buttonClasses("md")}>
        Sold out
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {max > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <QuantityPicker value={Math.min(qty, max)} max={max} onChange={setQty} label={`Quantity of ${name}`} />
          <div className="flex min-w-60 flex-1 gap-3">
            <button
              type="button"
              className={`${secondaryButtonClasses("sm")} flex-1`}
              onClick={() => {
                cart.add(productId, Math.min(qty, max));
                setQty(1);
                setAdded(true);
              }}
            >
              Add to cart
            </button>
            <button
              type="button"
              className={`${buttonClasses("sm")} flex-1`}
              disabled={ordering}
              onClick={() => {
                setOrdering(true); // one add only, even if tapped again before checkout opens
                cart.add(productId, Math.min(qty, max));
                router.push("/checkout");
              }}
            >
              {ordering ? "Opening checkout…" : "Order now"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted">You have all {stock} in stock in your cart.</p>
          <Link href="/checkout" className={buttonClasses("sm")}>
            Checkout
          </Link>
        </div>
      )}
      {added && (
        <FormAlert tone="success">
          Added to your cart.{" "}
          <Link href="/cart" className={`font-medium underline ${focusRingClasses}`}>
            View cart
          </Link>
        </FormAlert>
      )}
    </div>
  );
}
