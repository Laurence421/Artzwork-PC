"use client";

import { useEffect } from "react";
import { markOrderSeen } from "../actions/orders";

/** Marks the order seen once its page is actually open in the browser (not on a prefetch). */
export function MarkOrderSeen({ token }: { token: string }) {
  useEffect(() => {
    void markOrderSeen(token);
  }, [token]);
  return null;
}
