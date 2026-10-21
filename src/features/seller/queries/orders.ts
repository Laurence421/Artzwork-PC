import "server-only";
import type { OrderStatus } from "@/features/shared/ui/order-status-badge";
import { getSellerStore } from "./store";

export type { OrderStatus };
export const ORDER_STATUSES: OrderStatus[] = ["pending", "paid", "shipped", "completed", "cancelled"];

export type OrderRow = {
  id: string;
  orderNo: number;
  createdAt: string;
  status: OrderStatus;
  total: number;
  customer: string;
  email: string;
  payment: string;
  /** Store pickup: shipping it means "ready for pickup". */
  pickup: boolean;
  /** Reference number the customer sent for their GCash or bank payment. */
  paymentRef: string | null;
};

type Row = {
  id: string;
  order_no: number;
  created_at: string;
  status: OrderStatus;
  total: number;
  contact: { name: string; email: string };
  payment_method: { label: string };
  shipping_option: { kind?: string } | null;
  payment_ref: string | null;
};

/** How many orders the list and the CSV show at most; `more` says when there are older ones. */
export const ORDER_LIST_LIMIT = 1000;

/** Orders, newest first. q matches the order number exactly, or the customer's name or email. */
export async function listOrders({ status, q }: { status?: OrderStatus; q?: string }): Promise<{ orders: OrderRow[]; more: boolean }> {
  const { supabase, store } = await getSellerStore();
  let query = supabase
    .from("orders")
    .select("id, order_no, created_at, status, total, contact, payment_method, shipping_option, payment_ref")
    .eq("store_id", store.id)
    .order("created_at", { ascending: false })
    .limit(ORDER_LIST_LIMIT + 1);

  if (status) query = query.eq("status", status);
  const term = q?.replace(/^#/, "").trim();
  if (term) {
    if (/^\d+$/.test(term)) {
      query = query.eq("order_no", Number(term));
    } else {
      // Characters that would break the PostgREST or() filter, and LIKE wildcards, are removed.
      const safe = term.replace(/[,()%_\\*]/g, " ").trim();
      if (safe) query = query.or(`contact->>name.ilike.*${safe}*,contact->>email.ilike.*${safe}*`);
    }
  }

  const { data } = await query.returns<Row[]>();
  const rows = data ?? [];
  const orders = rows.slice(0, ORDER_LIST_LIMIT).map((o) => ({
    id: o.id,
    orderNo: o.order_no,
    createdAt: o.created_at,
    status: o.status,
    total: o.total,
    customer: o.contact?.name ?? "",
    email: o.contact?.email ?? "",
    payment: o.payment_method?.label ?? "",
    pickup: o.shipping_option?.kind === "pickup",
    paymentRef: o.payment_ref,
  }));
  return { orders, more: rows.length > ORDER_LIST_LIMIT };
}

/** Pending orders, for the menu badge. */
export async function countPendingOrders(): Promise<number> {
  const { supabase, store } = await getSellerStore();
  const { count } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("store_id", store.id)
    .eq("status", "pending");
  return count ?? 0;
}

export type OrderDetail = {
  id: string;
  orderNo: number;
  createdAt: string;
  status: OrderStatus;
  customerId: string;
  contact: { name: string; email: string; phone: string };
  address: { recipient: string; phone: string; line1: string; line2?: string; barangay?: string; city: string; province: string; postal_code?: string };
  payment: { label: string; type: string; account_name?: string; account_number?: string };
  shipping: { name: string; fee: number; kind?: string };
  courier: string | null;
  trackingNo: string | null;
  trackingUrl: string | null;
  paymentRef: string | null;
  paymentRefAt: string | null;
  /** What the customer was asked to pay: the total plus centavos that make it unique (auto-check). */
  payAmount: number;
  notes: string | null;
  subtotal: number;
  shippingFee: number;
  total: number;
  trackingToken: string;
  items: { id: string; productId: string | null; name: string; unitPrice: number; quantity: number; lineTotal: number }[];
  events: { id: string; status: OrderStatus; note: string | null; createdAt: string }[];
};

export async function getOrder(id: string): Promise<OrderDetail | null> {
  const { supabase, store } = await getSellerStore();
  const { data: o } = await supabase
    .from("orders")
    .select(
      "id, order_no, created_at, status, customer_id, contact, shipping_address, payment_method, shipping_option, courier, tracking_no, tracking_url, payment_ref, payment_ref_at, pay_amount, notes, subtotal, shipping_fee, total, tracking_token, order_items(id, product_id, product_name, unit_price, quantity, line_total), order_status_events(id, status, note, created_at)",
    )
    .eq("store_id", store.id)
    .eq("id", id)
    .maybeSingle();
  if (!o) return null;

  return {
    id: o.id,
    orderNo: o.order_no,
    createdAt: o.created_at,
    status: o.status,
    customerId: o.customer_id,
    contact: o.contact,
    address: o.shipping_address,
    payment: o.payment_method,
    shipping: o.shipping_option,
    courier: o.courier,
    trackingNo: o.tracking_no,
    trackingUrl: o.tracking_url,
    paymentRef: o.payment_ref,
    paymentRefAt: o.payment_ref_at,
    payAmount: o.pay_amount ?? o.total,
    notes: o.notes,
    subtotal: o.subtotal,
    shippingFee: o.shipping_fee,
    total: o.total,
    trackingToken: o.tracking_token,
    items: (o.order_items ?? []).map((i: { id: string; product_id: string | null; product_name: string; unit_price: number; quantity: number; line_total: number }) => ({
      id: i.id,
      productId: i.product_id,
      name: i.product_name,
      unitPrice: i.unit_price,
      quantity: i.quantity,
      lineTotal: i.line_total,
    })),
    events: [...(o.order_status_events ?? [])]
      .sort((a: { created_at: string }, b: { created_at: string }) => a.created_at.localeCompare(b.created_at))
      .map((e: { id: string; status: OrderStatus; note: string | null; created_at: string }) => ({
        id: e.id,
        status: e.status,
        note: e.note,
        createdAt: e.created_at,
      })),
  };
}

export type LatestOrder = { id: string; orderNo: number; total: number; customer: string } | null;

/** The newest order, for the new-order alert in the admin. */
export async function getLatestOrder(): Promise<LatestOrder> {
  const { supabase, store } = await getSellerStore();
  const { data } = await supabase
    .from("orders")
    .select("id, order_no, total, contact")
    .eq("store_id", store.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id, orderNo: data.order_no, total: data.total, customer: (data.contact as { name?: string })?.name ?? "" } : null;
}
