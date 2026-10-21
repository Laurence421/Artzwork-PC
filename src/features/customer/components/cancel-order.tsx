"use client";

import { useActionState, useId } from "react";
import { FormAlert } from "@/features/shared/ui/form-alert";
import { secondaryButtonClasses } from "@/features/shared/ui/button-styles";
import { ConfirmButton } from "@/features/shared/ui/confirm-button";
import type { OrderStatus } from "@/features/shared/ui/order-status-badge";
import { cancelMyOrder, type CancelOrderState } from "../actions/orders";

/**
 * "Cancel order" on the customer's order page: open until the order ships, then shown
 * disabled with the reason.
 */
export function CancelOrder({ token, orderNo, status }: { token: string; orderNo: number; status: OrderStatus }) {
  const reasonId = useId();
  const [state, action, pending] = useActionState<CancelOrderState, FormData>(cancelMyOrder.bind(null, token), {});
  if (status === "cancelled") return null;
  const open = status === "pending" || status === "paid";

  return (
    <form action={action} className="flex flex-col gap-4 border-t border-border pt-4">
      {state.error && <FormAlert>{state.error}</FormAlert>}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p id={reasonId} className="text-sm text-muted">
          {!open
            ? "Orders can't be cancelled once they ship. Contact the shop if you need help."
            : status === "paid"
              ? "Changed your mind? You can cancel until the order ships. The shop will contact you about your refund."
              : "Changed your mind? You can cancel until the order ships."}
        </p>
        <ConfirmButton
          title={`Cancel order #${orderNo}?`}
          message="Its items go back into stock. You can't undo this."
          confirmLabel="Cancel order"
          tone="danger"
          aria-describedby={reasonId}
          disabled={!open || pending}
          className={secondaryButtonClasses("sm", "danger")}
        >
          {pending ? "Cancelling…" : "Cancel order"}
        </ConfirmButton>
      </div>
    </form>
  );
}
