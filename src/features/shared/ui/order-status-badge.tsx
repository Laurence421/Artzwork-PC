export type OrderStatus = "pending" | "paid" | "shipped" | "completed" | "cancelled";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  shipped: "Shipped",
  completed: "Completed",
  cancelled: "Cancelled",
};

// Theme colours only; the word is always shown, so the colour is never the only signal.
const STYLE: Record<OrderStatus, string> = {
  pending: "border-border text-foreground",
  paid: "border-success/30 bg-success-surface text-success",
  shipped: "border-primary/40 text-primary",
  completed: "border-border text-muted",
  cancelled: "border-danger/30 bg-danger-surface text-danger",
};

/** The word for a status; a store-pickup order that "shipped" is ready for pickup. */
export function statusLabel(status: OrderStatus, pickup = false) {
  return pickup && status === "shipped" ? "Ready for pickup" : STATUS_LABEL[status];
}

/** An order's status as a small bordered tag (seller pages and the customer's My orders). */
export function OrderStatusBadge({ status, pickup = false }: { status: OrderStatus; pickup?: boolean }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${STYLE[status]}`}>{statusLabel(status, pickup)}</span>
  );
}
