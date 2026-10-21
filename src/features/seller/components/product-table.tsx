"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useState } from "react";
import { discountPercent, formatPrice } from "@/features/shared/lib/money";
import { Badge } from "@/features/shared/ui/badge";
import { focusRingClasses, secondaryButtonClasses } from "@/features/shared/ui/button-styles";
import { ConfirmButton } from "@/features/shared/ui/confirm-button";
import { FormAlert } from "@/features/shared/ui/form-alert";
import { bulkProducts, type BulkState } from "../actions/products";
import type { SellerProductRow } from "../queries/products";

function Thumb({ url }: { url: string | null }) {
  return (
    <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-border">
      {/* Decorative: the product name is the link right beside it. */}
      {url && <Image src={url} alt="" fill sizes="48px" className="object-cover" />}
    </div>
  );
}

function Price({ p }: { p: SellerProductRow }) {
  return p.salePrice !== null ? (
    <span className="flex flex-wrap items-baseline gap-x-2">
      <span className="font-semibold">{formatPrice(p.salePrice)}</span>
      <span className="text-muted line-through">{formatPrice(p.price)}</span>
      {discountPercent(p.price, p.salePrice) >= 1 && (
              <span className="font-semibold text-primary">{discountPercent(p.price, p.salePrice)}% off</span>
            )}
    </span>
  ) : (
    <span className="font-semibold">{formatPrice(p.price)}</span>
  );
}

function Stock({ p }: { p: SellerProductRow }) {
  if (p.soldOut) return <span className="text-danger">Sold out</span>;
  return <span className={p.stock <= p.lowStockThreshold ? "text-danger" : undefined}>{p.stock} left</span>;
}

function Status({ visible }: { visible: boolean }) {
  return <span className={visible ? undefined : "text-muted"}>{visible ? "In shop" : "Hidden"}</span>;
}

/** Product list with ticks for bulk show / hide / delete. Table on desktop, cards on phones. */
export function ProductTable({ products }: { products: SellerProductRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Clear the ticks only once an action has worked, so a failure keeps them.
  const [state, action, pending] = useActionState<BulkState, FormData>(async (prev, formData) => {
    const result = await bulkProducts(prev, formData);
    if (result.message) setSelected(new Set());
    return result;
  }, {});
  const allTicked = products.length > 0 && selected.size === products.length;
  const tickClass = `size-4 cursor-pointer accent-primary ${focusRingClasses}`;
  const selectAll = (
    <input
      type="checkbox"
      aria-label="Select all products"
      checked={allTicked}
      onChange={() => setSelected(allTicked ? new Set() : new Set(products.map((p) => p.id)))}
      className={tickClass}
    />
  );

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const tick = (p: SellerProductRow) => (
    <input
      type="checkbox"
      aria-label={`Select ${p.name}`}
      checked={selected.has(p.id)}
      onChange={() => toggle(p.id)}
      className={tickClass}
    />
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="ids" value={id} />
      ))}

      {state.message && <FormAlert tone="success">{state.message}</FormAlert>}
      {state.error && <FormAlert>{state.error}</FormAlert>}

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface p-3">
          <span className="mr-auto text-sm font-medium">{selected.size} selected</span>
          <button type="submit" name="action" value="show" disabled={pending} className={secondaryButtonClasses()}>
            Show in shop
          </button>
          <button type="submit" name="action" value="hide" disabled={pending} className={secondaryButtonClasses()}>
            Hide
          </button>
          <ConfirmButton
            title={`Delete ${selected.size} ${selected.size === 1 ? "product" : "products"}?`}
            message="This can't be undone."
            confirmLabel="Delete"
            tone="danger"
            name="action"
            value="delete"
            disabled={pending}
            className={secondaryButtonClasses("sm", "danger")}
          >
            Delete
          </ConfirmButton>
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-surface md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-muted">
            <tr>
              <th className="w-12 px-4 py-3">{selectAll}</th>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Stock</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">{tick(p)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Thumb url={p.imageUrl} />
                    <div className="flex min-w-0 flex-col gap-1">
                      <Link href={`/products/${p.id}`} className={`truncate font-medium hover:underline ${focusRingClasses}`}>
                        {p.name}
                      </Link>
                      {(p.labels.length > 0 || p.category) && (
                        <div className="flex flex-wrap items-center gap-1">
                          {p.category && <span className="text-xs text-muted">{p.category}</span>}
                          {p.labels.map((l) => (
                            <Badge key={l.id} text={l.text} color={l.color} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Price p={p} />
                </td>
                <td className="px-4 py-3 tabular-nums">
                  <Stock p={p} />
                </td>
                <td className="px-4 py-3">
                  <Status visible={p.isVisible} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phone cards */}
      <label className="flex items-center gap-3 px-3 text-sm text-muted md:hidden">
        {selectAll}
        Select all
      </label>
      <ul className="flex flex-col gap-2 md:hidden">
        {products.map((p) => (
          <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
            {tick(p)}
            <Thumb url={p.imageUrl} />
            <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
              <Link href={`/products/${p.id}`} className={`truncate font-medium hover:underline ${focusRingClasses}`}>
                {p.name}
              </Link>
              <Price p={p} />
              <span className="flex flex-wrap gap-x-3">
                <Stock p={p} />
                <Status visible={p.isVisible} />
              </span>
            </div>
          </li>
        ))}
      </ul>
    </form>
  );
}
