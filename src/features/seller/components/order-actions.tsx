"use client";

import { useActionState, useState } from "react";
import { buttonClasses, secondaryButtonClasses } from "@/features/shared/ui/button-styles";
import { ConfirmButton } from "@/features/shared/ui/confirm-button";
import { COURIERS } from "@/features/shared/lib/couriers";
import { FormAlert } from "@/features/shared/ui/form-alert";
import { Select } from "@/features/shared/ui/select";
import { TextField } from "@/features/shared/ui/text-field";
import { changeOrderStatus, type StatusFormState } from "../actions/orders";
import type { OrderStatus } from "../queries/orders";

// The next steps the database allows from each status.
const NEXT: Record<OrderStatus, { status: string; label: string; pending: string }[]> = {
  pending: [{ status: "paid", label: "Mark as paid", pending: "Marking as paid…" }],
  paid: [{ status: "shipped", label: "Mark as shipped", pending: "Marking as shipped…" }],
  shipped: [{ status: "completed", label: "Mark as completed", pending: "Marking as completed…" }],
  completed: [],
  cancelled: [],
};
const CAN_CANCEL: OrderStatus[] = ["pending", "paid"];

const COURIER_OPTIONS = [
  { value: "", label: "Choose a courier" },
  ...COURIERS.map((c) => ({ value: c.name, label: c.name })),
  { value: "Other", label: "Other" },
];

/**
 * Status buttons for one order: the next step, and Cancel while it is still allowed.
 * Shipping asks for the courier and tracking number; a store-pickup order is "ready for pickup" instead.
 */
export function OrderActions({
  orderId,
  orderNo,
  status,
  pickup = false,
  paymentRef = null,
}: {
  orderId: string;
  orderNo: number;
  status: OrderStatus;
  pickup?: boolean;
  /** Reference the customer sent for a GCash or bank payment, shown before "Mark as paid". */
  paymentRef?: string | null;
}) {
  const [state, action, busy] = useActionState<StatusFormState, FormData>(changeOrderStatus.bind(null, orderId), {});
  const next = NEXT[status].map((n) =>
    pickup && n.status === "shipped" ? { ...n, label: "Mark as ready for pickup", pending: "Marking as ready for pickup…" } : n,
  );
  const shipping = status === "paid";
  const v = state.values;
  // Which button was pressed, so only that one shows its pending label.
  const [pressed, setPressed] = useState<string | null>(null);

  if (next.length === 0 && !CAN_CANCEL.includes(status)) {
    return (
      <div className="flex flex-col gap-4">
        {state.message && <FormAlert tone="success">{state.message}</FormAlert>}
        <p className="text-sm text-muted">{status === "completed" ? "This order is complete." : "This order was cancelled."} Nothing more to do.</p>
      </div>
    );
  }

  return (
    // Remounts with what was typed after a failed save, so only the marked field needs fixing.
    <form action={action} className="flex flex-col gap-4" key={JSON.stringify(v ?? null)}>
      {status === "pending" && (
        <p className="text-sm">
          {paymentRef ? (
            <>
              Customer&apos;s payment reference: <span className="font-semibold tabular-nums">{paymentRef}</span>. Find it in your GCash or bank app before marking as paid.
            </>
          ) : (
            <span className="text-muted">No payment reference from the customer yet.</span>
          )}
        </p>
      )}
      {shipping && pickup && <input type="hidden" name="pickup" value="1" />}
      {shipping && !pickup && (
        <>
          <Select label="Courier" name="courier" options={COURIER_OPTIONS} defaultValue={v?.courier ?? ""} hint="Fill this in when you mark the order as shipped." />
          <TextField label="Tracking number" name="trackingNo" maxLength={60} autoComplete="off" defaultValue={v?.trackingNo} />
          <TextField
            label="Tracking link"
            name="trackingUrl"
            inputMode="url"
            defaultValue={v?.trackingUrl}
            maxLength={500}
            placeholder="https://"
            hint="Optional. For Lalamove or Grab, paste the trip's share link."
            error={state.fieldErrors?.trackingUrl}
          />
        </>
      )}
      <TextField label="Note" name="note" maxLength={500} placeholder="Optional" defaultValue={v?.note} hint="Saved in the order's history. The customer sees it on their tracking page." />
      {state.message && <FormAlert tone="success">{state.message}</FormAlert>}
      {state.error && <FormAlert>{state.error}</FormAlert>}
      <div className="flex flex-wrap gap-2">
        {next.map((n) => (
          <button
            key={n.status}
            type="submit"
            name="status"
            value={n.status}
            disabled={busy}
            className={buttonClasses("sm")}
            onClick={() => setPressed(n.status)}
          >
            {busy && pressed === n.status ? n.pending : n.label}
          </button>
        ))}
        {CAN_CANCEL.includes(status) && (
          <ConfirmButton
            title={`Cancel order #${orderNo}?`}
            message="Its items go back into stock. This can't be undone."
            confirmLabel="Cancel order"
            tone="danger"
            name="status"
            value="cancelled"
            disabled={busy}
            className={secondaryButtonClasses("sm", "danger")}
            onClick={() => setPressed("cancelled")}
          >
            {busy && pressed === "cancelled" ? "Cancelling…" : "Cancel order"}
          </ConfirmButton>
        )}
      </div>
    </form>
  );
}
