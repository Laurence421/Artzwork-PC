"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { focusRingClasses, secondaryButtonClasses } from "@/features/shared/ui/button-styles";
import { useCloseOnHide } from "@/features/shared/ui/use-close-on-hide";
import type { OrderStatus } from "../queries/orders";
import { OrderActions } from "./order-actions";

/**
 * "Update status" on a row of the Orders list: opens the same status form as the order page
 * (courier details when shipping, Cancel, note) in a dialog, so the seller stays on the list.
 * Orders with nothing left to do (completed, cancelled) get no button.
 */
export function QuickStatus({
  orderId,
  orderNo,
  status,
  pickup,
  paymentRef,
}: {
  orderId: string;
  orderNo: number;
  status: OrderStatus;
  pickup: boolean;
  paymentRef: string | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // A new key each time it opens, so the form starts fresh instead of showing the last result.
  const [session, setSession] = useState(0);
  // The dialog stays mounted once the order is done, so completing or cancelling from it
  // still shows the result; only the button goes.
  const done = status === "completed" || status === "cancelled";

  useCloseOnHide(dialogRef);

  return (
    <>
      {!done && (
        <button
          type="button"
          className={secondaryButtonClasses("sm")}
          aria-label={`Update status of order #${orderNo}`}
          onClick={() => {
            setSession((n) => n + 1);
            dialogRef.current?.showModal();
          }}
        >
          Update status
        </button>
      )}
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-border bg-surface text-left text-foreground backdrop:bg-overlay"
        // The dialog has no padding of its own, so a click that lands on it is on the backdrop: close.
        onClick={(e) => e.target === e.currentTarget && dialogRef.current?.close()}
      >
        <div className="flex max-h-[85vh] flex-col gap-4 overflow-y-auto p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 id={titleId} className="text-base font-semibold">
              Order #{orderNo}
            </h2>
            <Link
              href={`/orders/${orderId}`}
              onClick={() => dialogRef.current?.close()}
              className={`text-sm text-primary hover:underline ${focusRingClasses}`}
            >
              Open order
            </Link>
          </div>
          <OrderActions key={session} orderId={orderId} orderNo={orderNo} status={status} pickup={pickup} paymentRef={paymentRef} />
          <div className="flex justify-end border-t border-border pt-4">
            <button type="button" className={secondaryButtonClasses("sm")} onClick={() => dialogRef.current?.close()}>
              Close
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
