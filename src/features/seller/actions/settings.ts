"use server";

import { refresh, updateTag } from "next/cache";
import { z } from "zod";
import { isQrPh } from "@/features/shared/lib/qrph";
import { CATALOG_TAG } from "@/features/shared/lib/cache-tags";
import { parsePesos } from "@/features/shared/lib/money";
import { ASSETS_BUCKET } from "@/features/shared/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { PAYMENT_DEFAULTS, type PaymentType } from "../queries/settings";
import { getSellerStore } from "../queries/store";

export type SettingsFormState = {
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string | undefined>;
  values?: Record<string, string>;
  /** New on every success, so a form can start empty again. */
  nonce?: string;
};

const TYPES: PaymentType[] = ["cod", "gcash", "bank_transfer"];
const PH_MOBILE = /^(09|\+639)\d{9}$/;

/** Checkout reads payment and delivery options from the cached catalog, so it must refresh too. */
function afterChange() {
  updateTag(CATALOG_TAG);
  refresh();
}

// Payment methods ---------------------------------------------------------------

export async function savePayments(_prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  const { supabase, store } = await getSellerStore();
  const str = (k: string) => String(formData.get(k) ?? "").trim();
  const values = Object.fromEntries([...formData.keys()].filter((k) => !k.startsWith("$")).map((k) => [k, str(k)]));
  const fieldErrors: Record<string, string> = {};

  const input = TYPES.map((type) => ({
    type,
    enabled: formData.get(`${type}.enabled`) === "on",
    label: str(`${type}.label`) || PAYMENT_DEFAULTS[type].label,
    instructions: str(`${type}.instructions`).slice(0, 2000),
    accountName: str(`${type}.accountName`).slice(0, 100),
    accountNumber: str(`${type}.accountNumber`).replace(/\s+/g, "").slice(0, 60),
    qrPath: str(`${type}.qrPath`) || null,
    // Read from the image in the browser; kept only if it really is a QR Ph code.
    qrPayload: isQrPh(str(`${type}.qrPayload`)) ? str(`${type}.qrPayload`) : null,
    online: type !== "cod" && formData.get(`${type}.mode`) === "online",
  }));

  for (const p of input) {
    if (p.label.length > 60) fieldErrors[`${p.type}.label`] = "Keep it under 60 characters";
    if (p.qrPath && !p.qrPath.startsWith(`${store.id}/`)) fieldErrors[`${p.type}.qr`] = "Upload the QR code again";
    // Online methods are paid on the provider's page: no account details to show customers.
    if (!p.enabled || p.type === "cod" || p.online) continue;
    if (!p.accountName) fieldErrors[`${p.type}.accountName`] = "Enter the account name customers will see";
    if (!p.accountNumber) fieldErrors[`${p.type}.accountNumber`] = p.type === "gcash" ? "Enter your GCash number" : "Enter the account number";
    else if (p.type === "gcash" && !PH_MOBILE.test(p.accountNumber)) fieldErrors["gcash.accountNumber"] = "Use a mobile number like 09171234567";
  }
  if (!input.some((p) => p.enabled)) return { error: "Turn on at least one payment method, or customers can't check out.", values };
  if (Object.keys(fieldErrors).length) return { error: "Fix the fields marked in red.", fieldErrors, values };

  const { data: existing } = await supabase.from("payment_methods").select("id, type, qr_path").eq("store_id", store.id);
  const removedQrs: string[] = [];

  for (const [position, p] of input.entries()) {
    const row = {
      enabled: p.enabled,
      label: p.label,
      instructions: p.instructions,
      account_name: p.type === "cod" ? null : p.accountName || null,
      account_number: p.type === "cod" ? null : p.accountNumber || null,
      qr_path: p.type === "cod" ? null : p.qrPath,
      qr_payload: p.type === "cod" || !p.qrPath ? null : p.qrPayload,
      online: p.online,
      position,
    };
    const current = existing?.find((e) => e.type === p.type);
    if (current?.qr_path && current.qr_path !== row.qr_path) removedQrs.push(current.qr_path);
    const { error } = current
      ? await supabase.from("payment_methods").update(row).eq("id", current.id)
      : await supabase.from("payment_methods").insert({ ...row, type: p.type, store_id: store.id });
    if (error) return { error: "We couldn't save your payment methods. Try again.", values };
  }

  if (removedQrs.length) await supabase.storage.from(ASSETS_BUCKET).remove(removedQrs);
  afterChange();
  return { message: "Payment methods saved." };
}

// Delivery options --------------------------------------------------------------

const shippingSchema = z.object({
  name: z.string().trim().min(1, { error: "Enter a name, like Metro Manila" }).max(60, { error: "Keep it under 60 characters" }),
  description: z.string().trim().max(300, { error: "Keep it under 300 characters" }),
  fee: z.string().transform((v, ctx) => {
    const c = v.trim() === "" ? 0 : parsePesos(v);
    if (c === null) ctx.addIssue({ code: "custom", message: "Enter a fee, like 100 or 0 for free" });
    return c ?? 0;
  }),
  enabled: z.boolean(),
  kind: z.enum(["delivery", "pickup"]),
});

/** Bound with an option id to edit it, or null to add a new one. */
export async function saveShippingOption(optionId: string | null, _prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  const { supabase, store } = await getSellerStore();
  const values = {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    fee: String(formData.get("fee") ?? ""),
    enabled: formData.get("enabled") === "on" ? "on" : "",
    kind: formData.get("kind") === "pickup" ? "pickup" : "delivery",
  };
  const parsed = shippingSchema.safeParse({ ...values, enabled: values.enabled === "on" });
  if (!parsed.success) {
    const f = z.flattenError(parsed.error).fieldErrors;
    return { error: "Fix the fields marked in red.", fieldErrors: { name: f.name?.[0], description: f.description?.[0], fee: f.fee?.[0] }, values };
  }
  const v = parsed.data;

  if (optionId) {
    if (!v.enabled) {
      const { count } = await supabase
        .from("shipping_options")
        .select("id", { count: "exact", head: true })
        .eq("store_id", store.id)
        .eq("enabled", true)
        .neq("id", optionId);
      if (!count) return { error: "Keep at least one delivery option on, or customers can't check out.", values };
    }
    const { error } = await supabase
      .from("shipping_options")
      .update({ name: v.name, description: v.description, fee: v.fee, enabled: v.enabled, kind: v.kind })
      .eq("id", optionId)
      .eq("store_id", store.id);
    if (error) return { error: "We couldn't save this delivery option. Try again.", values };
  } else {
    const { data: last } = await supabase
      .from("shipping_options")
      .select("position")
      .eq("store_id", store.id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await supabase
      .from("shipping_options")
      .insert({ store_id: store.id, name: v.name, description: v.description, fee: v.fee, enabled: v.enabled, kind: v.kind, position: (last?.position ?? -1) + 1 });
    if (error) return { error: "We couldn't add this delivery option. Try again.", values };
  }

  afterChange();
  return { message: optionId ? "Delivery option saved." : "Delivery option added.", nonce: crypto.randomUUID() };
}

export async function deleteShippingOption(optionId: string): Promise<SettingsFormState> {
  const { supabase, store } = await getSellerStore();
  const { count } = await supabase
    .from("shipping_options")
    .select("id", { count: "exact", head: true })
    .eq("store_id", store.id)
    .eq("enabled", true)
    .neq("id", optionId);
  if (!count) return { error: "Keep at least one delivery option on, or customers can't check out." };
  // Past orders keep their own copy of the option, so deleting it is safe.
  const { error } = await supabase.from("shipping_options").delete().eq("id", optionId).eq("store_id", store.id);
  if (error) return { error: "We couldn't remove this delivery option. Try again." };
  afterChange();
  return { message: "Delivery option removed." };
}

/** Swap an option with its neighbour, so customers see them in this order. */
export async function moveShippingOption(optionId: string, direction: "up" | "down"): Promise<SettingsFormState> {
  const { supabase, store } = await getSellerStore();
  const { data } = await supabase.from("shipping_options").select("id, position").eq("store_id", store.id).order("position").order("created_at");
  const list = data ?? [];
  const i = list.findIndex((o) => o.id === optionId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return {};
  [list[i], list[j]] = [list[j], list[i]];
  const results = await Promise.all(
    list.map((o, position) => supabase.from("shipping_options").update({ position }).eq("id", o.id).eq("store_id", store.id)),
  );
  if (results.some((r) => r.error)) return { error: "We couldn't move this delivery option. Try again." };
  afterChange();
  return {};
}

// Orders --------------------------------------------------------------------------

export async function saveOrderSettings(_prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  const { supabase, store } = await getSellerStore();
  const raw = String(formData.get("ttl") ?? "");
  const days = z.coerce.number().int().min(1).max(30).safeParse(raw);
  if (!days.success) return { error: "Fix the fields marked in red.", fieldErrors: { ttl: "Use a whole number from 1 to 30" }, values: { ttl: raw } };
  const { error } = await supabase.from("stores").update({ pending_order_ttl_days: days.data }).eq("id", store.id);
  if (error) return { error: "We couldn't save this. Try again.", values: { ttl: raw } };
  refresh();
  return { message: `Unpaid orders now cancel after ${days.data} ${days.data === 1 ? "day" : "days"}.` };
}

// Account ---------------------------------------------------------------------------

export async function changePassword(_prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  await getSellerStore(); // owner only
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const fieldErrors: Record<string, string> = {};
  if (!current) fieldErrors.current = "Enter your current password";
  if (next.length < 8) fieldErrors.next = "At least 8 characters";
  else if (next === current) fieldErrors.next = "Choose a password different from the current one";
  if (Object.keys(fieldErrors).length) return { error: "Fix the fields marked in red.", fieldErrors };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const email = typeof auth?.claims?.email === "string" ? auth.claims.email : "";
  // Prove it's really the owner at the keyboard before changing the password.
  const { error: wrong } = await supabase.auth.signInWithPassword({ email, password: current });
  if (wrong) return { error: "Fix the fields marked in red.", fieldErrors: { current: "That isn't your current password" } };

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) {
    return {
      error: error.code === "weak_password" ? "Fix the fields marked in red." : "We couldn't change your password. Try again.",
      fieldErrors: error.code === "weak_password" ? { next: "Choose a stronger password" } : undefined,
    };
  }
  return { message: "Password changed." };
}
