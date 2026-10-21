import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { OrderStatus } from "@/features/shared/ui/order-status-badge";
import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in customer, once per request; anyone signed out goes to the shop login
 * and comes back to `next` afterwards.
 */
type Claims = {
  sub: string;
  email?: string;
  user_metadata?: { full_name?: string; name?: string; phone?: string };
  app_metadata?: { providers?: string[] };
};

/**
 * The signed-in customer from their session token. getClaims checks the token's signature here
 * (the project signs with ES256), so no round trip to Supabase Auth on every page.
 */
const signedInCustomer = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const c = data?.claims as Claims | undefined;
  if (!c?.sub) return { supabase, user: null };
  const meta = c.user_metadata ?? {};
  return {
    supabase,
    user: {
      id: c.sub,
      email: c.email ?? "",
      name: meta.full_name ?? meta.name ?? "",
      phone: meta.phone ?? "",
      // Google accounts have no password here; they change it at Google.
      hasPassword: (c.app_metadata?.providers ?? []).includes("email"),
    },
  };
});

/**
 * The signed-in customer, once per request; anyone signed out goes to the shop login
 * and comes back to `next` afterwards.
 */
export const requireCustomer = cache(async (next: string) => {
  const { supabase, user } = await signedInCustomer();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return { supabase, user };
});

/** The signed-in customer's email, or null (the account layout shows tabs only when signed in). */
export async function getCustomerEmail(): Promise<string | null> {
  const { user } = await signedInCustomer();
  return user ? user.email : null;
}

export type MyOrder = { id: string; orderNo: number; createdAt: string; status: OrderStatus; total: number; trackingToken: string; itemCount: number; hasUpdate: boolean; pickup: boolean };

/** The customer's own orders (RLS returns only orders linked to this account), newest first. */
export async function listMyOrders(): Promise<MyOrder[]> {
  const { supabase } = await requireCustomer("/orders");
  const { data } = await supabase
    .from("orders")
    .select("*, order_items(quantity)")
    .order("created_at", { ascending: false })
    .limit(200);
  return (data ?? []).map((o) => ({
    id: o.id,
    orderNo: o.order_no,
    createdAt: o.created_at,
    status: o.status,
    total: o.total,
    trackingToken: o.tracking_token,
    itemCount: (o.order_items ?? []).reduce((n: number, i: { quantity: number }) => n + i.quantity, 0),
    // Changed since they last opened it (placing the order itself is not news).
    pickup: o.shipping_option?.kind === "pickup",
    hasUpdate: !!o.status_changed_at && new Date(o.status_changed_at).getTime() > (o.customer_seen_at ? new Date(o.customer_seen_at).getTime() : new Date(o.created_at).getTime() + 1000),
  }));
}

export type SavedAddress = {
  id: string;
  label: string;
  recipient: string;
  phone: string;
  line1: string;
  line2: string;
  barangay: string;
  city: string;
  province: string;
  postalCode: string;
  isDefault: boolean;
};

/** Saved addresses, default first. */
export async function listAddresses(): Promise<SavedAddress[]> {
  const { supabase } = await requireCustomer("/account/addresses");
  const { data } = await supabase
    .from("customer_addresses")
    .select("id, label, recipient, phone, line1, line2, barangay, city, province, postal_code, is_default")
    .order("is_default", { ascending: false })
    .order("created_at");
  return (data ?? []).map((a) => ({
    id: a.id,
    label: a.label,
    recipient: a.recipient,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2 ?? "",
    barangay: a.barangay ?? "",
    city: a.city,
    province: a.province,
    postalCode: a.postal_code ?? "",
    isDefault: a.is_default,
  }));
}

/** Checkout prefill for a signed-in customer; null when signed out (guest checkout). */
export async function getCheckoutProfile() {
  const { supabase, user } = await signedInCustomer();
  if (!user) return null;
  const { data: rows } = await supabase
    .from("customer_addresses")
    .select("id, label, recipient, phone, line1, line2, barangay, city, province, postal_code, is_default")
    .order("is_default", { ascending: false })
    .order("created_at");
  return {
    email: user.email,
    name: user.name,
    phone: user.phone,
    addresses: (rows ?? []).map(
      (a): SavedAddress => ({
        id: a.id,
        label: a.label,
        recipient: a.recipient,
        phone: a.phone,
        line1: a.line1,
        line2: a.line2 ?? "",
        barangay: a.barangay ?? "",
        city: a.city,
        province: a.province,
        postalCode: a.postal_code ?? "",
        isDefault: a.is_default,
      }),
    ),
  };
}
