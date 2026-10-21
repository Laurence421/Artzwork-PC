"use server";

import { z } from "zod";
import { getCartLines, type CartLine } from "../queries/catalog";

/** Fresh name, price and stock for what's in a browser cart. */
export async function lookupCart(ids: string[]): Promise<CartLine[]> {
  const parsed = z.array(z.string().uuid()).max(50).safeParse(ids);
  return parsed.success ? getCartLines(parsed.data) : [];
}
