"use client";

import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/features/shared/lib/money";
import { buttonClasses, focusRingClasses, secondaryButtonClasses } from "@/features/shared/ui/button-styles";
import { FormAlert } from "@/features/shared/ui/form-alert";
import { useCartLines } from "../cart/use-cart-lines";
import { AlertAction, CartLoadError } from "./cart-load-error";
import { EmptyCart } from "./empty-cart";
import { QuantityPicker } from "./quantity-picker";

/** The cart page: lines, quantities, subtotal, and the way to checkout. */
export function CartView() {
  const { cart, lines, missing, short, subtotal, loading, error, retry } = useCartLines();

  if (!cart.ready) return <p className="text-sm text-muted">Loading…</p>;
  if (cart.items.length === 0) return <EmptyCart />;
  if (error) return <CartLoadError onRetry={retry} />;
  if (loading && lines.length === 0) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="flex flex-col gap-4">
        {missing.length > 0 && (
          <FormAlert>
            {missing.length === 1 ? "An item in your cart is" : `${missing.length} items in your cart are`} no longer sold.{" "}
            <AlertAction onClick={() => missing.forEach((m) => cart.remove(m.id))}>Remove {missing.length === 1 ? "it" : "them"}</AlertAction>
          </FormAlert>
        )}
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface">
          {lines.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-border">
                {l.image && <Image src={l.image} alt="" fill sizes="64px" className="object-cover" />}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                <Link href={`/p/${l.slug}`} className={`truncate font-medium hover:underline ${focusRingClasses}`}>
                  {l.name}
                </Link>
                <span className="flex flex-wrap items-baseline gap-x-2 tabular-nums">
                  <span className="font-semibold">{formatPrice(l.unitPrice)}</span>
                  {l.unitPrice < l.price && <span className="text-muted line-through">{formatPrice(l.price)}</span>}
                </span>
                {l.stock <= 0 ? (
                  <span className="text-danger">Sold out. Remove it to check out.</span>
                ) : (
                  l.qty > l.stock && <span className="text-danger">Only {l.stock} left. Lower the quantity.</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {l.stock > 0 && (
                  <QuantityPicker value={l.qty} max={Math.min(99, Math.max(l.stock, l.qty))} onChange={(q) => cart.setQty(l.id, q)} label={`Quantity of ${l.name}`} />
                )}
                <button type="button" className={secondaryButtonClasses("sm", "danger")} onClick={() => cart.remove(l.id)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <aside className="flex h-fit flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-base font-semibold">Summary</h2>
        <p className="flex justify-between text-sm">
          <span className="text-muted">Subtotal</span>
          <span className="tabular-nums">{formatPrice(subtotal)}</span>
        </p>
        <p className="text-sm text-muted">Delivery is added at checkout.</p>
        {short.length > 0 || missing.length > 0 ? (
          <button type="button" disabled className={buttonClasses("md")}>
            Checkout
          </button>
        ) : (
          <Link href="/checkout" className={buttonClasses("md")}>
            Checkout
          </Link>
        )}
      </aside>
    </div>
  );
}
