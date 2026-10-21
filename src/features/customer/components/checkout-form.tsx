"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useId, useState } from "react";
import { formatPrice } from "@/features/shared/lib/money";
import { Button } from "@/features/shared/ui/button";
import { buttonClasses } from "@/features/shared/ui/button-styles";
import { FormAlert } from "@/features/shared/ui/form-alert";
import { Checkbox } from "@/features/shared/ui/checkbox";
import { Select } from "@/features/shared/ui/select";
import { TextArea } from "@/features/shared/ui/text-area";
import { TextField } from "@/features/shared/ui/text-field";
import { placeOrder, type CheckoutState } from "../actions/checkout";
import { useCartLines } from "../cart/use-cart-lines";
import { AddressFields } from "./account-forms";
import { CartLoadError } from "./cart-load-error";
import { EmptyCart } from "./empty-cart";
import type { SavedAddress } from "../queries/account";
import type { CheckoutOptions } from "../queries/catalog";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** A radio shown as a bordered card; the checked one is outlined in the primary colour. */
function ChoiceCard({
  name,
  value,
  checked,
  onChange,
  title,
  detail,
  side,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  detail?: string;
  side?: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${
        checked ? "border-primary" : "border-border"
      }`}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="mt-0.5 size-4 accent-primary" />
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="font-medium">{title}</span>
        {detail && <span className="text-muted">{detail}</span>}
      </span>
      {side && <span className="font-semibold tabular-nums">{side}</span>}
    </label>
  );
}

/** Under an online payment method at checkout. */
const ONLINE_HINT: Record<string, string> = {
  gcash: "You'll pay on GCash right after you place your order.",
  bank_transfer: "You'll pay with online banking right after you place your order.",
};

export type CheckoutProfile = { email: string; name: string; phone: string; addresses: SavedAddress[] };

const NEW_ADDRESS = "new";

export function CheckoutForm({ options, profile }: { options: CheckoutOptions; profile?: CheckoutProfile }) {
  const accountEmail = profile?.email;
  // Signed in with saved addresses: start from the default one; "new" types a fresh one.
  const [addressId, setAddressId] = useState(profile?.addresses[0]?.id ?? NEW_ADDRESS);
  const saved = profile?.addresses.find((a) => a.id === addressId);
  const router = useRouter();
  const { cart, lines, missing, short, subtotal, loading, error, retry } = useCartLines();
  const paymentErrorId = useId();
  const shippingErrorId = useId();
  const [payment, setPayment] = useState(options.payments[0]?.id ?? "");
  const [shipping, setShipping] = useState(options.shipping[0]?.id ?? "");
  const [redirecting, setRedirecting] = useState(false);

  // Clear the cart only once the order exists, then show it.
  const [state, action] = useActionState<CheckoutState, FormData>(async (prev, formData) => {
    const result = await placeOrder(prev, formData);
    if (result.trackingToken) {
      cart.clear();
      // Online payment: straight to GCash / online banking, like other shops. Otherwise the order page.
      if (result.payUrl) {
        setRedirecting(true); // keeps the page busy until the payment page opens
        window.location.assign(result.payUrl);
      }
      else router.push(`/order/${result.trackingToken}?new=1`);
    }
    return result;
  }, {});
  const e = state.fieldErrors ?? {};
  const v = state.values;

  if (redirecting) return <p className="text-sm text-muted">Opening the payment page…</p>;
  if (!cart.ready) return <p className="text-sm text-muted">Loading…</p>;
  if (cart.items.length === 0 && !state.trackingToken) return <EmptyCart />;
  if (error) return <CartLoadError onRetry={retry} />;
  if (loading && lines.length === 0) return <p className="text-sm text-muted">Loading…</p>;

  const fee = options.shipping.find((s) => s.id === shipping)?.fee ?? 0;
  const online = options.payments.find((p) => p.id === payment)?.online ?? false;
  // Store pickup: no address to fill in (the server checks the option's kind itself).
  const pickup = options.shipping.find((s) => s.id === shipping)?.kind === "pickup";
  const cartBlocked = missing.length > 0 || short.length > 0;
  const setupMissing = options.payments.length === 0 || options.shipping.length === 0;
  const named = state.productId ? lines.find((l) => l.id === state.productId)?.name : undefined;

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[2fr_1fr]" key={JSON.stringify(v ?? null)}>
      <input type="hidden" name="storeSlug" value={options.storeSlug} />
      <input type="hidden" name="items" value={JSON.stringify(lines.map((l) => ({ product_id: l.id, quantity: l.qty })))} />

      <div className="flex flex-col gap-6">
        <Section title="Contact">
          <TextField label="Full name" name="name" defaultValue={v?.name ?? profile?.name} autoComplete="name" required maxLength={100} error={e.name} />
          {accountEmail ? (
            <TextField label="Email" value={accountEmail} readOnly hint="Your order is saved to your account." />
          ) : (
            <TextField
              label="Email"
              name="email"
              type="email" defaultValue={v?.email}
              autoComplete="email"
              required
              hint="We'll send your order details here."
              error={e.email}
            />
          )}
          <TextField label="Mobile number" name="phone" defaultValue={v?.phone ?? profile?.phone} type="tel" autoComplete="tel" required placeholder="0917 123 4567" error={e.phone} />
        </Section>

        {pickup ? (
          <Section title="Store pickup">
            <p className="text-sm text-muted">No delivery address needed. Your order page will say when it&apos;s ready and where to pick it up.</p>
          </Section>
        ) : (
        <Section title="Delivery address">
          {profile && profile.addresses.length > 0 && (
            <Select
              label="Deliver to"
              value={addressId}
              onChange={(ev) => setAddressId(ev.target.value)}
              options={[
                ...profile.addresses.map((a) => ({ value: a.id, label: `${a.label}: ${a.line1}, ${a.city}${a.isDefault ? " (default)" : ""}` })),
                { value: NEW_ADDRESS, label: "A new address" },
              ]}
            />
          )}
          {/* Picking a saved address refills the fields below; they can still be edited. */}
          <div key={addressId} className="flex flex-col gap-4">
            <AddressFields address={saved} state={state} prefix="ship_" withLabel={false} contactFallback />
          </div>
          {profile && addressId === NEW_ADDRESS && (
            <div className="flex flex-col gap-4">
              <Checkbox name="saveAddress" label="Save this address to my account" defaultChecked />
              <TextField label="Name this address" name="ship_label" maxLength={40} placeholder="e.g. Home, Office" defaultValue={v?.ship_label} />
            </div>
          )}
        </Section>
        )}

        <Section title="Payment">
          <fieldset className="flex flex-col gap-2" aria-describedby={e.payment ? paymentErrorId : undefined}>
            <legend className="sr-only">Payment method</legend>
            {options.payments.map((p) => (
              <ChoiceCard
                key={p.id}
                name="payment"
                value={p.id}
                checked={payment === p.id}
                onChange={() => setPayment(p.id)}
                title={p.label}
                detail={p.online ? (ONLINE_HINT[p.type] ?? "You'll pay online right after you place your order.") : p.instructions || undefined}
              />
            ))}
            {options.payments.length === 0 && <p className="text-sm text-muted">The shop hasn&apos;t set up payment yet.</p>}
            {e.payment && (
              <p id={paymentErrorId} className="text-sm text-danger">
                {e.payment}
              </p>
            )}
          </fieldset>
        </Section>

        <Section title="Delivery">
          <fieldset className="flex flex-col gap-2" aria-describedby={e.shipping ? shippingErrorId : undefined}>
            <legend className="sr-only">Delivery option</legend>
            {options.shipping.map((s) => (
              <ChoiceCard
                key={s.id}
                name="shipping"
                value={s.id}
                checked={shipping === s.id}
                onChange={() => setShipping(s.id)}
                title={s.name}
                detail={s.description || undefined}
                side={s.fee === 0 ? "Free" : formatPrice(s.fee)}
              />
            ))}
            {options.shipping.length === 0 && <p className="text-sm text-muted">The shop hasn&apos;t set up delivery yet.</p>}
            {e.shipping && (
              <p id={shippingErrorId} className="text-sm text-danger">
                {e.shipping}
              </p>
            )}
          </fieldset>
          <TextArea label="Notes for the shop" name="notes" defaultValue={v?.notes} rows={3} maxLength={1000} placeholder="Optional" />
        </Section>
      </div>

      <aside className="flex h-fit flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-base font-semibold">Order summary</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {lines.map((l) => (
            <li key={l.id} className="flex justify-between gap-4">
              <span className="min-w-0 truncate">
                {l.qty} × {l.name}
              </span>
              <span className="shrink-0 tabular-nums">{formatPrice(l.unitPrice * l.qty)}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-1 border-t border-border pt-4 text-sm">
          <p className="flex justify-between">
            <span className="text-muted">Subtotal</span>
            <span className="tabular-nums">{formatPrice(subtotal)}</span>
          </p>
          <p className="flex justify-between">
            <span className="text-muted">Delivery</span>
            <span className="tabular-nums">{fee === 0 ? "Free" : formatPrice(fee)}</span>
          </p>
          <p className="flex justify-between text-base font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatPrice(subtotal + fee)}</span>
          </p>
        </div>

        {state.error && (
          <FormAlert>
            {named ? `${named}: ` : ""}
            {state.error}
          </FormAlert>
        )}
        {cartBlocked ? (
          <Link href="/cart" className={buttonClasses("md")}>
            Fix your cart first
          </Link>
        ) : setupMissing ? (
          <button type="button" disabled className={buttonClasses("md")}>
            Not taking orders yet
          </button>
        ) : (
          <Button pendingLabel={online ? "Opening payment…" : "Placing order…"}>{online ? "Place order & pay" : "Place order"}</Button>
        )}
        <p className="text-xs text-muted">Prices and stock are checked again when you place the order.</p>
      </aside>
    </form>
  );
}
