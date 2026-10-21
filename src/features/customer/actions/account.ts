"use server";

import { refresh } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { z } from "zod";
import { requireCustomer } from "../queries/account";

export type AccountFormState = {
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string | undefined>;
  values?: Record<string, string>;
  /** New on every success, so an add form can start empty again. */
  nonce?: string;
};

const PHONE = /^[0-9+()\-\s]{7,20}$/;
const req = (msg: string, max: number) => z.string().trim().min(1, { error: msg }).max(max, { error: `Keep it under ${max} characters` });
const opt = (max: number) => z.string().trim().max(max, { error: `Keep it under ${max} characters` });

const addressSchema = z.object({
  label: opt(40),
  recipient: req("Enter who receives the order", 100),
  phone: z.string().trim().regex(PHONE, { error: "Enter a phone number, like 0917 123 4567" }),
  line1: req("Enter the house no. and street", 200),
  line2: opt(200),
  barangay: opt(100),
  city: req("Enter the city or municipality", 100),
  province: req("Enter the province", 100),
  postalCode: opt(10),
});

const FIELDS = ["label", "recipient", "phone", "line1", "line2", "barangay", "city", "province", "postalCode"] as const;

function readAddress(formData: FormData) {
  return Object.fromEntries(FIELDS.map((k) => [k, String(formData.get(k) ?? "")])) as Record<(typeof FIELDS)[number], string>;
}

/** Bound with an address id to edit it, or null to add one. */
export async function saveAddress(addressId: string | null, _prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const { supabase, user } = await requireCustomer("/account/addresses");
  const values = { ...readAddress(formData), isDefault: formData.get("isDefault") === "on" ? "on" : "" };
  const parsed = addressSchema.safeParse(values);
  if (!parsed.success) {
    const f = z.flattenError(parsed.error).fieldErrors;
    return { error: "Fix the fields marked in red.", fieldErrors: Object.fromEntries(FIELDS.map((k) => [k, f[k]?.[0]])), values };
  }
  const v = parsed.data;
  const row = {
    label: v.label || "Home",
    recipient: v.recipient,
    phone: v.phone,
    line1: v.line1,
    line2: v.line2 || null,
    barangay: v.barangay || null,
    city: v.city,
    province: v.province,
    postal_code: v.postalCode || null,
  };

  // The first address is the default; marking one default unmarks the others.
  const { count } = await supabase.from("customer_addresses").select("id", { count: "exact", head: true });
  const makeDefault = values.isDefault === "on" || (!addressId && !count);
  if (makeDefault) await supabase.from("customer_addresses").update({ is_default: false }).eq("user_id", user.id);

  const { error } = addressId
    ? await supabase.from("customer_addresses").update({ ...row, ...(makeDefault && { is_default: true }) }).eq("id", addressId)
    : await supabase.from("customer_addresses").insert({ ...row, is_default: makeDefault });
  if (error) return { error: "We couldn't save this address. Try again.", values };

  refresh();
  return { message: addressId ? "Address saved." : "Address added.", nonce: crypto.randomUUID() };
}

export async function deleteAddress(addressId: string): Promise<AccountFormState> {
  const { supabase } = await requireCustomer("/account/addresses");
  const { error } = await supabase.from("customer_addresses").delete().eq("id", addressId);
  if (error) return { error: "We couldn't remove this address. Try again." };
  refresh();
  return { message: "Address removed." };
}

export async function saveProfile(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const { supabase } = await requireCustomer("/account/profile");
  const values = { name: String(formData.get("name") ?? ""), phone: String(formData.get("phone") ?? "") };
  const parsed = z
    .object({
      name: opt(100),
      phone: z.string().trim().regex(/^$|^[0-9+()\-\s]{7,20}$/, { error: "Enter a phone number, like 0917 123 4567" }),
    })
    .safeParse(values);
  if (!parsed.success) {
    const f = z.flattenError(parsed.error).fieldErrors;
    return { error: "Fix the fields marked in red.", fieldErrors: { name: f.name?.[0], phone: f.phone?.[0] }, values };
  }
  const { error } = await supabase.auth.updateUser({ data: { full_name: parsed.data.name, phone: parsed.data.phone } });
  if (error) return { error: "We couldn't save your details. Try again.", values };
  // Pages read the name from the session token: get a fresh one so they show the change now.
  await supabase.auth.refreshSession();
  refresh();
  return { message: "Your details are saved. Checkout fills them in for you." };
}

export async function changeCustomerPassword(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const { supabase, user } = await requireCustomer("/account/profile");
  if (!user.hasPassword) return { error: "You sign in with Google, so your password is managed there." };
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const fieldErrors: Record<string, string> = {};
  if (!current) fieldErrors.current = "Enter your current password";
  if (next.length < 8) fieldErrors.next = "At least 8 characters";
  else if (next === current) fieldErrors.next = "Choose a password different from the current one";
  if (Object.keys(fieldErrors).length) return { error: "Fix the fields marked in red.", fieldErrors };

  const { error: wrong } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
  if (wrong) return { error: "Fix the fields marked in red.", fieldErrors: { current: "That isn't your current password" } };
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) {
    return error.code === "weak_password"
      ? { error: "Fix the fields marked in red.", fieldErrors: { next: "Choose a stronger password" } }
      : { error: "We couldn't change your password. Try again." };
  }
  return { message: "Password changed." };
}

/** Deletes the signed-in customer's own account (delete_my_account() refuses the shop owner). */
export async function deleteMyAccount(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const { supabase } = await requireCustomer("/account/profile");
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") {
    return { error: "Fix the fields marked in red.", fieldErrors: { confirm: "Type DELETE to confirm" } };
  }
  const { error } = await supabase.rpc("delete_my_account");
  if (error) {
    return {
      error:
        error.message === "OWNER_ACCOUNT"
          ? "This is the shop owner's account, so it can't be deleted here."
          : "We couldn't delete your account. Try again.",
    };
  }
  // The user is gone; clear this browser's session cookie too.
  await supabase.auth.signOut();
  redirect("/login?error=deleted", RedirectType.replace);
}
