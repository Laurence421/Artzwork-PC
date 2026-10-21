"use client";

import { useActionState, useId, useState, useTransition } from "react";
import Link from "next/link";
import { formatPrice, toPesoInput } from "@/features/shared/lib/money";
import { Button } from "@/features/shared/ui/button";
import { focusRingClasses, secondaryButtonClasses } from "@/features/shared/ui/button-styles";
import { ConfirmButton } from "@/features/shared/ui/confirm-button";
import { Checkbox } from "@/features/shared/ui/checkbox";
import { FormAlert } from "@/features/shared/ui/form-alert";
import { TextArea } from "@/features/shared/ui/text-area";
import { Select } from "@/features/shared/ui/select";
import { TextField } from "@/features/shared/ui/text-field";
import {
  changePassword,
  deleteShippingOption,
  moveShippingOption,
  saveOrderSettings,
  savePayments,
  saveShippingOption,
  type SettingsFormState,
} from "../actions/settings";
import { testPaymentSms, type SmsTestState } from "../actions/payment-sms";
import type { PaymentSetting, PaymentSmsRow, PaymentType, Settings, ShippingSetting } from "../queries/settings";
import { ImageUpload } from "./image-upload";
import { QrPayloadField } from "./qr-payload-field";

function Result({ state }: { state: SettingsFormState }) {
  return (
    <>
      {state.message && <FormAlert tone="success">{state.message}</FormAlert>}
      {state.error && <FormAlert>{state.error}</FormAlert>}
    </>
  );
}

const PAYMENT_TITLE: Record<PaymentType, string> = { cod: "Cash on delivery", gcash: "GCash", bank_transfer: "Bank transfer" };

// Payment methods -------------------------------------------------------------------

/** How online payments are set up on this server (PayMongo keys, the test page, or neither). */
export type PaymentProviderStatus = "paymongo" | "test" | "off";

const PROVIDER_NOTE: Record<PaymentProviderStatus, { tone: "success" | "danger"; text: string }> = {
  paymongo: { tone: "success", text: "Online payments are connected to PayMongo. Customers who choose an online method pay on GCash or their bank's page, and the order is marked paid by itself." },
  test: { tone: "success", text: "Online payments are in TEST mode: customers see a test payment page and no money moves. Add PayMongo keys to take real payments." },
  off: { tone: "danger", text: "Online payments aren't set up on this server, so online methods can't be paid. Use Manual, or ask your developer to add the PayMongo keys." },
};

export function PaymentSettings({ storeId, payments, provider }: { storeId: string; payments: Settings["payments"]; provider: PaymentProviderStatus }) {
  const [state, action] = useActionState<SettingsFormState, FormData>(savePayments, {});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  // The QR image shown in each method, so its code can be read when it changes.
  const [qrUrls, setQrUrls] = useState<Record<string, string | null>>({ gcash: payments.gcash.qrUrl, bank_transfer: payments.bank_transfer.qrUrl });
  const [modes, setModes] = useState<Record<string, string>>({
    gcash: payments.gcash.online ? "online" : "manual",
    bank_transfer: payments.bank_transfer.online ? "online" : "manual",
  });
  const busy = Object.values(uploading).some(Boolean);
  const v = state.values;
  const e = state.fieldErrors ?? {};
  // After a failed save, the fields start from what was submitted (React resets forms after an action).
  const val = (p: PaymentSetting, k: "label" | "instructions" | "accountName" | "accountNumber") => v?.[`${p.type}.${k}`] ?? p[k];

  return (
    <form action={action} className="flex flex-col gap-4" key={JSON.stringify(v ?? null)}>
      {/* A standing status, not the result of an action: a plain note, not an alert. */}
      <p className={`rounded-lg border px-3 py-2 text-sm ${PROVIDER_NOTE[provider].tone === "danger" ? "border-danger/30 text-danger" : "border-border text-muted"}`}>
        {PROVIDER_NOTE[provider].text}
      </p>
      {(["cod", "gcash", "bank_transfer"] as PaymentType[]).map((type) => {
        const p = payments[type];
        // From state (not the submitted values), so the choice can still be changed after a failed save.
        const online = type !== "cod" && modes[type] === "online";
        return (
          <section key={type} aria-labelledby={`pay-${type}`} className="flex flex-col gap-4 rounded-xl border border-border p-3">
            <h3 id={`pay-${type}`} className="text-sm font-semibold">
              {PAYMENT_TITLE[type]}
            </h3>
            <Checkbox
              name={`${type}.enabled`}
              variant="switch"
              label={`Accept ${PAYMENT_TITLE[type]}`}
              defaultChecked={v ? v[`${type}.enabled`] === "on" : p.enabled}
            />
            <TextField label="Name shown at checkout" name={`${type}.label`} maxLength={60} defaultValue={val(p, "label")} error={e[`${type}.label`]} />
            {type !== "cod" && (
              <Select
                label="How customers pay"
                name={`${type}.mode`}
                value={online ? "online" : "manual"}
                onChange={(ev) => setModes((m) => ({ ...m, [type]: ev.target.value }))}
                options={[
                  { value: "online", label: type === "gcash" ? "Online: send them to GCash to pay (PayMongo)" : "Online: send them to online banking to pay (PayMongo)" },
                  { value: "manual", label: type === "gcash" ? "Manual: they send money to my GCash number" : "Manual: they transfer to my bank account" },
                ]}
                hint={online ? "Paid orders are marked paid by themselves." : "You check the payment and mark the order as paid."}
              />
            )}
            {/* Manual details stay in the form while Online is chosen (hidden), so switching back keeps them. */}
            <div className={online ? "hidden" : "flex flex-col gap-4"}>
            {type !== "cod" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Account name" name={`${type}.accountName`} maxLength={100} defaultValue={val(p, "accountName")} error={e[`${type}.accountName`]} />
                <TextField
                  label={type === "gcash" ? "GCash number" : "Account number"}
                  name={`${type}.accountNumber`}
                  inputMode={type === "gcash" ? "tel" : "numeric"}
                  maxLength={60}
                  placeholder={type === "gcash" ? "09171234567" : undefined}
                  defaultValue={val(p, "accountNumber")}
                  error={e[`${type}.accountNumber`]}
                />
              </div>
            )}
            <TextArea
              label="Instructions for customers"
              name={`${type}.instructions`}
              rows={3}
              maxLength={2000}
              defaultValue={val(p, "instructions")}
              hint={type === "bank_transfer" ? "Include the bank name, e.g. BDO or BPI." : undefined}
            />
            {type !== "cod" && (
              <ImageUpload
                storeId={storeId}
                folder="payments"
                uploadLabel="Upload QR code"
                hint="Shown to customers on their order page."
                name={`${type}.qrPath`}
                label={`${PAYMENT_TITLE[type]} QR code`}
                initialPath={v ? v[`${type}.qrPath`] || null : p.qrPath}
                initialUrl={p.qrUrl}
                error={e[`${type}.qr`]}
                onBusyChange={(b) => setUploading((u) => (u[type] === b ? u : { ...u, [type]: b }))}
                onChange={(url) => setQrUrls((q) => ({ ...q, [type]: url }))}
              />
            )}
            {type !== "cod" && <QrPayloadField name={`${type}.qrPayload`} imageUrl={qrUrls[type] ?? null} initial={p.qrPayload} />}
            </div>
          </section>
        );
      })}
      <Result state={state} />
      <div className="flex items-center justify-end gap-3">
        {busy && <p className="text-sm text-muted">Wait for the QR code to finish uploading.</p>}
        <Button size="sm" pendingLabel="Saving…" disabled={busy}>
          Save payment methods
        </Button>
      </div>
    </form>
  );
}

// Delivery options -------------------------------------------------------------------

function ShippingFields({ option, state }: { option?: ShippingSetting; state: SettingsFormState }) {
  const v = state.values;
  const e = state.fieldErrors ?? {};
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <TextField label="Name" name="name" required maxLength={60} placeholder="e.g. Metro Manila" defaultValue={v?.name ?? option?.name} error={e.name} />
        <TextField
          label="Fee"
          name="fee"
          prefix="₱"
          inputMode="decimal"
          placeholder="0.00"
          defaultValue={v?.fee ?? toPesoInput(option?.fee ?? 0)}
          hint="0 for free"
          error={e.fee}
        />
      </div>
      <Select
        label="Type"
        name="kind"
        options={[
          { value: "delivery", label: "Delivery by courier" },
          { value: "pickup", label: "Store pickup" },
        ]}
        defaultValue={v?.kind ?? option?.kind ?? "delivery"}
        hint="Store pickup orders show your shop address (Branding) instead of a tracking number."
      />
      <TextField
        label="Description"
        name="description"
        maxLength={300}
        placeholder="Optional, e.g. 2–3 days"
        defaultValue={v?.description ?? option?.description}
        error={e.description}
      />
      <Checkbox name="enabled" variant="switch" label="Offer at checkout" defaultChecked={v ? v.enabled === "on" : (option?.enabled ?? true)} />
    </>
  );
}

function ShippingRow({ option, first, last }: { option: ShippingSetting; first: boolean; last: boolean }) {
  const [state, action] = useActionState<SettingsFormState, FormData>(saveShippingOption.bind(null, option.id), {});
  const [deleteState, del, deleting] = useActionState<SettingsFormState, FormData>(() => deleteShippingOption(option.id), {});
  const [moving, startMove] = useTransition();
  const [moveState, setMoveState] = useState<SettingsFormState>({});
  // Which arrow was pressed, so only that one shows its pending text.
  const [movingDir, setMovingDir] = useState<"up" | "down" | null>(null);
  const deleteFormId = useId();
  const move = (direction: "up" | "down") =>
    startMove(async () => {
      setMovingDir(direction);
      setMoveState(await moveShippingOption(option.id, direction));
    });

  return (
    <li className="flex flex-col gap-4 rounded-xl border border-border p-3">
      {/* Remove submits this separate form, so the edit form's Save never shows pending for it. */}
      <form id={deleteFormId} action={del} className="hidden" />
      <form action={action} className="flex flex-col gap-4" key={JSON.stringify(state.values ?? null)}>
        <ShippingFields option={option} state={state} />
        <Result state={state} />
        <Result state={deleteState} />
        <Result state={moveState} />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={secondaryButtonClasses("sm")} disabled={first || moving} onClick={() => move("up")} aria-label={moving && movingDir === "up" ? `Moving ${option.name} up…` : `Move ${option.name} up`}>
            {moving && movingDir === "up" ? "Moving…" : "↑"}
          </button>
          <button type="button" className={secondaryButtonClasses("sm")} disabled={last || moving} onClick={() => move("down")} aria-label={moving && movingDir === "down" ? `Moving ${option.name} down…` : `Move ${option.name} down`}>
            {moving && movingDir === "down" ? "Moving…" : "↓"}
          </button>
          <ConfirmButton
            title={`Remove "${option.name}"?`}
            message="Past orders keep their own copy."
            confirmLabel="Remove"
            tone="danger"
            form={deleteFormId}
            className={`${secondaryButtonClasses("sm", "danger")} ml-auto`}
            disabled={deleting}
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

function AddShipping() {
  const [state, action] = useActionState<SettingsFormState, FormData>(saveShippingOption.bind(null, null), {});
  // Start empty again after a successful add; keep what was typed after an error.
  return (
    <form action={action} className="flex flex-col gap-4 rounded-xl border border-dashed border-border p-3" key={state.nonce ?? JSON.stringify(state.values ?? null)}>
      <p className="text-sm font-medium">Add a delivery option</p>
      <ShippingFields state={state.message ? {} : state} />
      <Result state={state} />
      <div className="flex justify-end">
        <Button size="sm" pendingLabel="Adding…">
          Add option
        </Button>
      </div>
    </form>
  );
}

export function ShippingSettings({ options }: { options: ShippingSetting[] }) {
  return (
    <div className="flex flex-col gap-4">
      {options.length > 0 && (
        <ul className="flex flex-col gap-4">
          {options.map((o, i) => (
            <ShippingRow key={o.id} option={o} first={i === 0} last={i === options.length - 1} />
          ))}
        </ul>
      )}
      <AddShipping />
    </div>
  );
}

// Orders ------------------------------------------------------------------------------

export function OrderSettings({ ttlDays }: { ttlDays: number }) {
  const [state, action] = useActionState<SettingsFormState, FormData>(saveOrderSettings, {});
  return (
    <form action={action} className="flex flex-col gap-4" key={JSON.stringify(state.values ?? null)}>
      <TextField
        label="Cancel unpaid orders after (days)"
        name="ttl"
        type="number"
        min={1}
        max={30}
        step={1}
        required
        defaultValue={state.values?.ttl ?? ttlDays}
        hint="Pending orders older than this are cancelled automatically and their stock goes back."
        error={state.fieldErrors?.ttl}
      />
      <Result state={state} />
      <div className="flex justify-end">
        <Button size="sm" pendingLabel="Saving…">
          Save
        </Button>
      </div>
    </form>
  );
}

// Account ------------------------------------------------------------------------------

export function AccountSettings({ email }: { email: string }) {
  const [state, action] = useActionState<SettingsFormState, FormData>(changePassword, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium">Seller email</p>
        <p className="text-sm">{email}</p>
        <p className="text-sm text-muted">Only this email can manage the shop.</p>
      </div>
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

// Automatic payment check (SMS) ------------------------------------------------------------

const SMS_RESULT: Record<string, string> = {
  matched: "Marked paid",
  already_paid: "Already paid",
  no_match: "No order for that amount",
  ambiguous: "Several orders, check yourself",
  not_payment: "Not a payment",
};

const SAMPLE_SMS = "You have received PHP 1,234.56 of GCash from JUAN D. 09171234567. Your new balance is PHP 5,000.00. Ref. No. 1012345678901.";

/**
 * Free automatic check of manual GCash / bank payments: the shop's Android phone forwards its
 * "You have received ..." SMS here, and the order waiting for that exact amount becomes paid.
 */
export function PaymentSmsSettings({ url, recent }: { url: string | null; recent: PaymentSmsRow[] }) {
  const [state, action] = useActionState<SmsTestState, FormData>(testPaymentSms, {});
  const [copied, setCopied] = useState<"" | "done" | "failed">("");
  const when = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });

  if (!url) {
    return (
      <p className="text-sm text-muted">
        Not switched on yet: ask your developer to turn it on. Until then you mark GCash and bank payments as paid yourself.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6 text-sm">
      <p className="text-muted">
        Each GCash or bank order shows an exact amount with a few extra centavos (e.g. ₱1,234.56). When your phone gets the &quot;You have
        received&quot; SMS for that amount, the order is marked paid by itself. Free, no payment company.
      </p>
      <ol className="flex list-decimal flex-col gap-2 pl-5">
        <li>On the Android phone that gets your GCash and bank SMS, install a free SMS forwarder app (for example &quot;SMS Forwarder&quot;).</li>
        <li>Add a rule: messages from GCash (and your bank) go to a webhook, method POST, at this address:</li>
      </ol>
      <div className="flex flex-col gap-2">
        {/* Read-only on purpose: a value to copy into the phone app, selected in one tap. */}
        <TextField label="Webhook address (keep it private)" value={url} readOnly onFocus={(e) => e.currentTarget.select()} />
        {copied === "failed" && <FormAlert>Couldn&apos;t copy. Tap the address, then copy it from your phone&apos;s menu.</FormAlert>}
        <div className="flex justify-end">
          <button
            type="button"
            className={secondaryButtonClasses("sm")}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setCopied("done");
                window.setTimeout(() => setCopied(""), 2000);
              } catch {
                setCopied("failed");
              }
            }}
          >
            {copied === "done" ? "Copied" : "Copy address"}
          </button>
        </div>
      </div>

      <form action={action} className="flex flex-col gap-4" key={state.value ?? ""}>
        <TextArea
          label="Try a sample SMS"
          name="sample"
          rows={3}
          maxLength={600}
          defaultValue={state.value ?? SAMPLE_SMS}
          hint="Paste a GCash or bank SMS. Nothing is changed; it only says what would happen."
        />
        <Result state={state} />
        <div className="flex justify-end">
          <Button size="sm" pendingLabel="Checking…">
            Check
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Recent payment SMS</h3>
        {recent.length === 0 ? (
          <p className="text-muted">None yet. They show here once your phone forwards them.</p>
        ) : (
          <ul className="flex flex-col">
            {recent.map((s) => (
              <li key={s.id} className="flex flex-wrap justify-between gap-2 border-b border-border py-2 last:border-0">
                <span className="text-muted">{when.format(new Date(s.receivedAt))}</span>
                <span className="tabular-nums">{s.amount !== null ? formatPrice(s.amount) : "—"}</span>
                <span>
                  {SMS_RESULT[s.result] ?? s.result}
                  {s.orderNo !== null && s.orderId && (
                    <>
                      {" · "}
                      <Link href={`/orders/${s.orderId}`} className={`text-primary hover:underline ${focusRingClasses}`}>
                        #{s.orderNo}
                      </Link>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
