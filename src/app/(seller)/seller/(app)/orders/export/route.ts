import { statusLabel } from "@/features/seller/components/order-status-badge";
import { listOrders, ORDER_STATUSES } from "@/features/seller/queries/orders";

// /orders/export on the seller site: the filtered order list as a CSV file.
// getSellerStore (inside listOrders) sends anyone but the signed-in owner away.

const when = new Intl.DateTimeFormat("en-PH", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });

const csvCell = (v: string | number) => {
  const s = String(v);
  // Quote everything; a leading = + - @ would make spreadsheets run it as a formula.
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const status = ORDER_STATUSES.find((s) => s === params.get("status"));
  const q = (params.get("q") ?? "").trim().slice(0, 100);
  const { orders } = await listOrders({ status, q });

  const rows = [
    ["Order", "Date", "Customer", "Email", "Payment", "Total (PHP)", "Status"],
    ...orders.map((o) => [o.orderNo, when.format(new Date(o.createdAt)), o.customer, o.email, o.payment, (o.total / 100).toFixed(2), statusLabel(o.status, o.pickup)]),
  ];
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  const date = new Date().toISOString().slice(0, 10);

  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="artzwork-orders-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
