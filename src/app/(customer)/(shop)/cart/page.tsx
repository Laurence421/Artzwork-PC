import type { Metadata } from "next";
import { CartView } from "@/features/customer/components/cart-view";

export const metadata: Metadata = { title: "Cart · Artzwork PC" };

export default function CartPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Your cart</h1>
      <CartView />
    </main>
  );
}
