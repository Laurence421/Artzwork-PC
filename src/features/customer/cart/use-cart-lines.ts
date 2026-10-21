"use client";

import { useEffect, useState } from "react";
import { lookupCart } from "../actions/cart";
import type { CartLine } from "../queries/catalog";
import { useCart, type CartItem } from "./cart-store";

export type ResolvedLine = CartLine & { qty: number };

/**
 * The browser cart joined with fresh product data. Items whose product is gone are
 * reported as `missing` so the page can say so and drop them.
 */
export function useCartLines() {
  const cart = useCart();
  const ids = cart.items.map((i) => i.id).join(",");
  const [data, setData] = useState<{ ids: string; lines: CartLine[] } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    lookupCart(ids ? ids.split(",") : [])
      .then((lines) => {
        if (live) setData({ ids, lines });
      })
      .catch(() => {
        if (live) setFailed(ids);
      });
    return () => {
      live = false;
    };
  }, [ids, attempt]);

  const error = failed === ids && data?.ids !== ids;
  const loading = !cart.ready || (data?.ids !== ids && !error);
  const byId = new Map((data?.lines ?? []).map((l) => [l.id, l]));
  const lines: ResolvedLine[] = [];
  const missing: CartItem[] = [];
  for (const item of cart.items) {
    const line = byId.get(item.id);
    if (line) lines.push({ ...line, qty: item.qty });
    else if (!loading) missing.push(item);
  }
  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
  const short = lines.filter((l) => l.qty > l.stock);

  const retry = () => {
    setFailed(null);
    setAttempt((n) => n + 1);
  };

  return { cart, lines, missing, short, subtotal, loading, error, retry };
}
