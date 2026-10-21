"use client";

import { useSyncExternalStore } from "react";

/**
 * The cart lives in the browser (guests keep it too): only product ids and quantities.
 * Names, prices and stock are always looked up fresh, and checkout re-checks them on the server.
 */
export type CartItem = { id: string; qty: number };

const KEY = "artzwork-cart:v1";
export const MAX_QTY = 99;
const EMPTY: CartItem[] = [];

let cached: { raw: string | null; items: CartItem[] } = { raw: null, items: EMPTY };
const listeners = new Set<() => void>();

function read(): CartItem[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return EMPTY; // storage blocked (private mode, settings): an empty cart that still works for this page
  }
  if (raw === cached.raw) return cached.items;
  let items: CartItem[] = EMPTY;
  try {
    const parsed = JSON.parse(raw ?? "[]");
    if (Array.isArray(parsed)) {
      items = parsed
        .filter((i) => typeof i?.id === "string" && Number.isInteger(i?.qty) && i.qty > 0)
        .map((i) => ({ id: i.id, qty: Math.min(i.qty, MAX_QTY) }));
    }
  } catch {
    items = EMPTY;
  }
  cached = { raw, items };
  return items;
}

function write(items: CartItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // ignore: the cart still updates for this page through the listeners
  }
  cached = { raw: JSON.stringify(items), items };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === KEY && listener(); // other tabs
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const noop = () => () => {};

export function useCart() {
  const items = useSyncExternalStore(subscribe, read, () => EMPTY);
  // false during the server render and hydration: the browser cart hasn't been read yet.
  const ready = useSyncExternalStore(noop, () => true, () => false);
  return {
    items,
    ready,
    count: items.reduce((n, i) => n + i.qty, 0),
    add(id: string, qty: number) {
      const current = read();
      const existing = current.find((i) => i.id === id);
      write(
        existing
          ? current.map((i) => (i.id === id ? { ...i, qty: Math.min(i.qty + qty, MAX_QTY) } : i))
          : [...current, { id, qty: Math.min(qty, MAX_QTY) }],
      );
    },
    setQty(id: string, qty: number) {
      write(read().map((i) => (i.id === id ? { ...i, qty: Math.max(1, Math.min(qty, MAX_QTY)) } : i)));
    },
    remove(id: string) {
      write(read().filter((i) => i.id !== id));
    },
    clear() {
      write([]);
    },
  };
}
