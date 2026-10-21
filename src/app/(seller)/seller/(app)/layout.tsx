import { Suspense } from "react";
import { checkLatestOrder } from "@/features/seller/actions/orders";
import { NewOrderAlert } from "@/features/seller/components/new-order-alert";
import { SellerShell } from "@/features/seller/components/seller-shell";
import { countPendingOrders, getLatestOrder } from "@/features/seller/queries/orders";
import { getSellerStore } from "@/features/seller/queries/store";

// Signed-in seller pages. Login, sign-up and onboarding live outside this group.
export default function SellerAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-muted">Loading…</p>}>
      <WithStore>{children}</WithStore>
    </Suspense>
  );
}

async function WithStore({ children }: { children: React.ReactNode }) {
  const [{ store }, pendingOrders, latest] = await Promise.all([getSellerStore(), countPendingOrders(), getLatestOrder()]);
  return (
    <SellerShell storeName={store.name} pendingOrders={pendingOrders}>
      {children}
      <NewOrderAlert initial={latest} check={checkLatestOrder} />
    </SellerShell>
  );
}
