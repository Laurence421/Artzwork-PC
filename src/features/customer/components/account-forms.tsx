"use client";

import { useActionState, useId } from "react";
import { Button } from "@/features/shared/ui/button";
import { secondaryButtonClasses } from "@/features/shared/ui/button-styles";
import { ConfirmButton } from "@/features/shared/ui/confirm-button";
import { Checkbox } from "@/features/shared/ui/checkbox";
import { FormAlert } from "@/features/shared/ui/form-alert";
import { TextField } from "@/features/shared/ui/text-field";
import { changeCustomerPassword, deleteAddress, deleteMyAccount, saveAddress, saveProfile, type AccountFormState } from "../actions/account";
import type { SavedAddress } from "../queries/account";

function Result({ state }: { state: AccountFormState }) {
  return (
    <>
      {state.message && <FormAlert tone="success">{state.message}</FormAlert>}
      {state.error && <FormAlert>{state.error}</FormAlert>}
    </>
  );
}

/**
 * The address fields, shared by the address book and checkout. prefix keeps their names apart
 * from checkout's own contact fields; at checkout Recipient and Mobile may be left empty.
 */
export function AddressFields({
  address,
  state,
  prefix = "",
  withLabel = true,
  contactFallback = false,
}: {
  address?: Partial<SavedAddress>;
  state?: { values?: Record<string, string>; fieldErrors?: Record<string, string | undefined> };
  prefix?: string;
  withLabel?: boolean;
  /** Checkout: an empty Recipient / Mobile number uses the contact's name and number. */
  contactFallback?: boolean;
}) {
  const v = state?.values;
  const e = Object.fromEntries(Object.entries(state?.fieldErrors ?? {})
      .filter(([k]) => k.startsWith(prefix))
      .map(([k, m]) => [k.slice(prefix.length), m])) as Record<string, string | undefined>;
  const n = (k: string) => `${prefix}${k}`;
  const val = (k: keyof SavedAddress & string, fallback = "") => v?.[n(k)] ?? (address?.[k] as string | undefined) ?? fallback;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {withLabel && <TextField label="Label" name={n("label")} maxLength={40} placeholder="e.g. Home, Office" defaultValue={val("label")} error={e.label} />}
        <TextField
          label="Recipient"
          name={n("recipient")}
          autoComplete="name"
          required={!contactFallback}
          maxLength={100}
          placeholder={contactFallback ? "Same as contact name" : undefined}
          defaultValue={val("recipient")}
          error={e.recipient}
        />
        <TextField
          label={contactFallback ? "Delivery mobile" : "Mobile number"}
          name={n("phone")}
          type="tel"
          autoComplete="tel"
          required={!contactFallback}
          placeholder={contactFallback ? "Same as contact number" : "0917 123 4567"}
          defaultValue={val("phone")}
          error={e.phone}
        />
      </div>
      <TextField label="House no. and street" name={n("line1")} autoComplete="address-line1" required defaultValue={val("line1")} error={e.line1} />
      <TextField label="Building, unit, landmark" name={n("line2")} autoComplete="address-line2" placeholder="Optional" defaultValue={val("line2")} error={e.line2} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Barangay" name={n("barangay")} placeholder="Optional" defaultValue={val("barangay")} error={e.barangay} />
        <TextField label="City / municipality" name={n("city")} autoComplete="address-level2" required defaultValue={val("city")} error={e.city} />
        <TextField label="Province" name={n("province")} autoComplete="address-level1" required defaultValue={val("province")} error={e.province} />
        <TextField label="Postal code" name={n("postalCode")} autoComplete="postal-code" inputMode="numeric" placeholder="Optional" defaultValue={val("postalCode")} error={e.postalCode} />
      </div>
    </>
  );
}

function AddressCard({ address }: { address: SavedAddress }) {
  const [state, action] = useActionState<AccountFormState, FormData>(saveAddress.bind(null, address.id), {});
  const [deleteState, del, deleting] = useActionState<AccountFormState, FormData>(() => deleteAddress(address.id), {});
  const deleteFormId = useId();

  return (
    <li className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">{address.label}</h2>
        {address.isDefault && <span className="rounded-full border border-primary/40 px-2 py-0.5 text-xs font-medium text-primary">Default</span>}
      </div>
      {/* Remove submits its own form, so Save never shows pending for it. */}
      <form id={deleteFormId} action={del} className="hidden" />
      <form action={action} className="flex flex-col gap-4" key={JSON.stringify(state.values ?? null)}>
        <AddressFields address={address} state={state} />
        {!address.isDefault && <Checkbox name="isDefault" label="Use as my default address" />}
        <Result state={state} />
        <Result state={deleteState} />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ConfirmButton
            title={`Remove the address "${address.label}"?`}
            confirmLabel="Remove"
            tone="danger"
            form={deleteFormId}
            disabled={deleting}
            className={`${secondaryButtonClasses("sm", "danger")} mr-auto`}
          >
            {deleting ? "Removing…" : "Remove"}
          </ConfirmButton>
          <Button size="sm" pendingLabel="Saving…">
            Save
          </Button>
        </div>
      </form>
    </li>
  );
}

function AddAddress({ first }: { first: boolean }) {
  const [state, action] = useActionState<AccountFormState, FormData>(saveAddress.bind(null, null), {});
  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-xl border border-dashed border-border p-6"
      key={state.nonce ?? JSON.stringify(state.values ?? null)}
    >
      <h2 className="text-base font-semibold">Add an address</h2>
      <AddressFields state={state.nonce ? {} : state} />
      {!first && <Checkbox name="isDefault" label="Use as my default address" />}
      <Result state={state} />
      <div className="flex justify-end">
        <Button size="sm" pendingLabel="Adding…">
          Add address
        </Button>
      </div>
    </form>
  );
}

export function AddressBook({ addresses }: { addresses: SavedAddress[] }) {
  return (
    <div className="flex flex-col gap-6">
      {addresses.length > 0 ? (
        <ul className="flex flex-col gap-6">
          {addresses.map((a) => (
            <AddressCard key={a.id} address={a} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No saved addresses yet. Add one to check out faster.</p>
      )}
      <AddAddress first={addresses.length === 0} />
    </div>
  );
}

export function ProfileForm({ name, phone }: { name: string; phone: string }) {
  const [state, action] = useActionState<AccountFormState, FormData>(saveProfile, {});
  const v = state.values;
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" key={JSON.stringify(v ?? null)}>
      <TextField label="Full name" name="name" autoComplete="name" maxLength={100} defaultValue={v?.name ?? name} error={e.name} />
      <TextField label="Mobile number" name="phone" type="tel" autoComplete="tel" placeholder="0917 123 4567" defaultValue={v?.phone ?? phone} error={e.phone} />
      <Result state={state} />
      <div className="flex justify-end">
        <Button size="sm" pendingLabel="Saving…">
          Save details
        </Button>
      </div>
    </form>
  );
}

/** Delete account: type DELETE, then confirm. Orders stay with the shop; login and addresses go. */
export function DeleteAccountForm() {
  const [state, action, pending] = useActionState<AccountFormState, FormData>(deleteMyAccount, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        This deletes your login and saved addresses. Your past orders stay with the shop so it can handle deliveries and
        returns, but they are no longer linked to an account.
      </p>
      <TextField label="Type DELETE to confirm" name="confirm" autoComplete="off" required error={state.fieldErrors?.confirm} />
      <Result state={state} />
      <div className="flex justify-end">
        <ConfirmButton
          title="Delete your account?"
          message="You can't undo this."
          confirmLabel="Delete my account"
          tone="danger"
          disabled={pending}
          className={secondaryButtonClasses("sm", "danger")}
        >
          {pending ? "Deleting…" : "Delete my account"}
        </ConfirmButton>
      </div>
    </form>
  );
}

export function CustomerPasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, action] = useActionState<AccountFormState, FormData>(changeCustomerPassword, {});
  const e = state.fieldErrors ?? {};
  if (!hasPassword) return <p className="text-sm text-muted">You sign in with Google, so your password is managed in your Google account.</p>;
  return (
    <form action={action} className="flex flex-col gap-4">
      <TextField label="Current password" name="current" type="password" autoComplete="current-password" required error={e.current} />
      <TextField label="New password" name="next" type="password" autoComplete="new-password" required minLength={8} hint="At least 8 characters" error={e.next} />
      <Result state={state} />
      <div className="flex justify-end">
        <Button size="sm" pendingLabel="Changing…">
          Change password
        </Button>
      </div>
    </form>
  );
}
