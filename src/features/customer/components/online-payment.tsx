"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/features/shared/ui/button";
import { FormAlert } from "@/features/shared/ui/form-alert";
import { payNow, syncPayment, type PayNowState } from "../actions/payments";

/**
 * On a pending order paid online (GCash, online banking): "Pay now" sends the customer to the
 * payment page. Coming back (?paid=1) it checks the payment, so the page turns to "paid" by itself.
 */
export function OnlinePayment({ token, label, amount, returned }: { token: string; label: string; amount: string; returned?: "1" | "0" }) {
  const [state, action] = useActionState<PayNowState, FormData>(payNow.bind(null, token), {});
  const router = useRouter();
  const [checking, setChecking] = useState(returned === "1");

  useEffect(() => {
    if (returned !== "1") return;
    let tries = 0;
    let stopped = false;
    // The provider can take a few seconds to confirm: check a few times, then leave it to the webhook.
    const check = async () => {
      await syncPayment(token);
      router.refresh();
      tries += 1;
      if (!stopped && tries < 4) window.setTimeout(check, 3000);
      else setChecking(false);
    };
    void check();
    return () => {
      stopped = true;
    };
  }, [returned, token, router]);

  return (
    <form action={action} className="flex flex-col gap-4">
      {checking && <p className="text-muted">Checking your payment…</p>}
      {returned === "1" && !checking && (
        <p className="text-muted">We haven&apos;t received the payment confirmation yet. If you paid, this page updates within a few minutes.</p>
      )}
      {returned === "0" && <FormAlert>Payment wasn&apos;t completed. You can try again.</FormAlert>}
      {state.error && <FormAlert>{state.error}</FormAlert>}
      <p>
        Pay <span className="font-semibold tabular-nums">{amount}</span> securely with {label}. You&apos;ll be taken to the payment page and
        brought back here.
      </p>
      <div className="flex">
        <Button size="sm" pendingLabel="Opening payment…">
          Pay now with {label}
        </Button>
      </div>
    </form>
  );
}
