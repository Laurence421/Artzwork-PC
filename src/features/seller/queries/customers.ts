import "server-only";
import type { OrderStatus } from "./orders";
import { getSellerStore } from "./store";

/** Orders that count as money in: the same rule as the dashboard's sales. */
const SOLD: OrderStatus[] = ["paid", "shipped", "completed"];

export const CUSTOMER_LIST_LIMIT = 1000;

type OrderBit = { id: string; order_no: number; total: number; status: OrderStatus; created_at: string; shipping_option?: { kind?: string } | null };
type Row = {
  id: string;
  name: string;
  email: string;
  phone: string;
  user_id: string | null;
  created_at: string;
  orders: OrderBit[];
};

export type CustomerRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  hasAccount: boolean;
  orderCount: number;
  spent: number;
  lastOrderAt: string | null;
};

/** Orders = every order (as the detail list shows them); Spent = paid, shipped and completed only. */
function summarise(r: Row): CustomerRow {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    hasAccount: r.user_id !== null,
    orderCount: r.orders.length,
    spent: r.orders.filter((o) => SOLD.includes(o.status)).reduce((sum, o) => sum + o.total, 0),
    lastOrderAt: r.orders.reduce<string | null>((last, o) => (!last || o.created_at > last ? o.created_at : last), null),
  };
}

/**
 * Everyone who has ordered, shown most recent order first. Past the limit, the newest
 * customers (by when they first ordered) are kept; the page says so. q matches name, email or phone.
 */
export async function listCustomers({ q }: { q?: string }): Promise<{ customers: CustomerRow[]; more: boolean }> {
  const { supabase, store } = await getSellerStore();
  let query = supabase
    .from("customers")
    .select("id, name, email, phone, user_id, created_at, orders(id, order_no, total, status, created_at)")
    .eq("store_id", store.id)
    .order("created_at", { ascending: false })
    .limit(CUSTOMER_LIST_LIMIT + 1);

  // Characters that would break the PostgREST or() filter, and LIKE wildcards, are removed.
  const safe = q?.replace(/[,()%_\\*]/g, " ").trim();
  if (safe) query = query.or(`name.ilike.*${safe}*,email.ilike.*${safe}*,phone.ilike.*${safe}*`);

  const { data } = await query.returns<Row[]>();
  const rows = data ?? [];
  const customers = rows
    .slice(0, CUSTOMER_LIST_LIMIT)
    .map(summarise)
    .sort((a, b) => (b.lastOrderAt ?? "").localeCompare(a.lastOrderAt ?? ""));
  return { customers, more: rows.length > CUSTOMER_LIST_LIMIT };
}

export type CustomerDetail = CustomerRow & {
  firstOrderAt: string | null;
  orders: { id: string; orderNo: number; total: number; status: OrderStatus; createdAt: string; pickup: boolean }[];
};

export async function getCustomer(id: string): Promise<CustomerDetail | null> {
  const { supabase, store } = await getSellerStore();
  const { data } = await supabase
    .from("customers")
    .select("id, name, email, phone, user_id, created_at, orders(id, order_no, total, status, created_at, shipping_option)")
    .eq("store_id", store.id)
    .eq("id", id)
    .maybeSingle<Row>();
  if (!data) return null;

  const orders = [...data.orders].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return {
    ...summarise(data),
    firstOrderAt: orders.at(-1)?.created_at ?? null,
    orders: orders.map((o) => ({ id: o.id, orderNo: o.order_no, total: o.total, status: o.status, createdAt: o.created_at, pickup: o.shipping_option?.kind === "pickup" })),
  };
}
