"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { DEFAULT_ACCENT, isReadableAccent, PREVIEW_MESSAGE, SOCIALS, type Branding, type SocialKey } from "@/features/shared/lib/branding";
import { Button } from "@/features/shared/ui/button";
import { FormAlert } from "@/features/shared/ui/form-alert";
import { TextArea } from "@/features/shared/ui/text-area";
import { TextField } from "@/features/shared/ui/text-field";
import { saveBranding, type BrandingFormState } from "../actions/branding";
import type { BrandingForEdit } from "../queries/branding";
import { ImageUpload } from "./image-upload";
import { Panel } from "./seller-shell";

// Accent choices that stay readable on the navy cards (checked with isReadableAccent).
const ACCENTS = [
  { name: "Logo blue", color: DEFAULT_ACCENT },
  { name: "Violet", color: "#a78bfa" },
  { name: "Sky", color: "#38bdf8" },
  { name: "Teal", color: "#2dd4bf" },
  { name: "Emerald", color: "#34d399" },
  { name: "Lime", color: "#a3e635" },
  { name: "Amber", color: "#fbbf24" },
  { name: "Orange", color: "#fb923c" },
  { name: "Pink", color: "#f472b6" },
];

/** Branding fields on the left, the live shop on the right; unsaved changes show in the preview only. */
export function BrandingForm({ storeId, initial, shopUrl }: { storeId: string; initial: BrandingForEdit; shopUrl?: string }) {
  const [state, action] = useActionState<BrandingFormState, FormData>(saveBranding, {});
  const [draft, setDraft] = useState<Branding>(initial.branding);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const busy = Object.values(uploading).some(Boolean);
  const frame = useRef<HTMLIFrameElement>(null);
  const shopOrigin = shopUrl ? new URL(shopUrl).origin : null;
  const e = state.fieldErrors ?? {};

  const set = <K extends keyof Branding>(key: K, value: Branding[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setContact = (key: keyof Branding["contact"], value: string) => setDraft((d) => ({ ...d, contact: { ...d.contact, [key]: value } }));
  const setSocial = (key: SocialKey, value: string) => setDraft((d) => ({ ...d, socials: { ...d.socials, [key]: value } }));
  const busyFor = (k: string) => (b: boolean) => setUploading((u) => (u[k] === b ? u : { ...u, [k]: b }));

  // Send the draft to the preview whenever it changes, and when the preview says it's ready.
  useEffect(() => {
    if (!shopOrigin) return;
    const send = () => frame.current?.contentWindow?.postMessage({ type: PREVIEW_MESSAGE, branding: draft }, shopOrigin);
    send();
    const onReady = (ev: MessageEvent) => {
      if (ev.origin === shopOrigin && ev.data?.type === `${PREVIEW_MESSAGE}:ready`) send();
    };
    window.addEventListener("message", onReady);
    return () => window.removeEventListener("message", onReady);
  }, [draft, shopOrigin]);

  const accentOk = isReadableAccent(draft.accent);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form action={action} className="flex flex-col gap-6">
        <Panel title="Basics">
          <TextField label="Store name" name="name" required maxLength={80} value={draft.name} onChange={(ev) => set("name", ev.target.value)} error={e.name} />
          <TextField
            label="Tagline"
            name="tagline"
            maxLength={160}
            placeholder="e.g. Computer parts and services"
            value={draft.tagline}
            onChange={(ev) => set("tagline", ev.target.value)}
            error={e.tagline}
          />
          <ImageUpload
            storeId={storeId}
            folder="branding"
            name="logoPath"
            label="Logo"
            uploadLabel="Upload logo"
            hint="Shown next to your shop name in the nav bar. A square image works best."
            initialPath={initial.paths.logo}
            initialUrl={initial.branding.logoUrl}
            error={e.logo}
            onBusyChange={busyFor("logo")}
            onChange={(url) => set("logoUrl", url)}
          />
          <ImageUpload
            storeId={storeId}
            folder="branding"
            name="faviconPath"
            label="Browser tab icon"
            uploadLabel="Upload icon"
            hint="The small icon in the browser tab. Square, at least 64 × 64."
            previewClassName="size-12"
            initialPath={initial.paths.favicon}
            initialUrl={initial.branding.faviconUrl}
            error={e.favicon}
            onBusyChange={busyFor("favicon")}
          />
        </Panel>

        <Panel title="Home page">
          <ImageUpload
            storeId={storeId}
            folder="branding"
            name="bannerPath"
            label="Banner"
            uploadLabel="Upload banner"
            hint="Wide image at the top of your home page, about 3 : 1 (e.g. 1500 × 500)."
            previewClassName="aspect-[3/1] w-full max-w-sm"
            initialPath={initial.paths.banner}
            initialUrl={initial.branding.bannerUrl}
            error={e.banner}
            onBusyChange={busyFor("banner")}
            onChange={(url) => set("bannerUrl", url)}
          />
          <TextField
            label="Announcement bar"
            name="announcement"
            maxLength={160}
            placeholder="e.g. Free delivery in Metro Manila over ₱5,000"
            hint="A short line above the nav bar on every shop page. Leave empty to hide it."
            value={draft.announcement}
            onChange={(ev) => set("announcement", ev.target.value)}
            error={e.announcement}
          />
        </Panel>

        <Panel title="Product pages">
          <TextField
            label="Instalment note"
            name="instalment"
            maxLength={160}
            placeholder="e.g. Instalment available via Salmon. Message us to apply."
            hint="Shown under the price on every product page. Leave empty to hide it."
            value={draft.instalment}
            onChange={(ev) => set("instalment", ev.target.value)}
            error={e.instalment}
          />
        </Panel>

        <Panel title="Accent colour">
          <input type="hidden" name="accent" value={draft.accent} />
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">Buttons and links in your shop</legend>
            <div className="flex flex-wrap items-center gap-2">
              {ACCENTS.map((a) => (
                <label key={a.color} className="cursor-pointer" title={a.name}>
                  <input
                    type="radio"
                    name="accentChoice"
                    value={a.color}
                    checked={draft.accent.toLowerCase() === a.color}
                    onChange={() => set("accent", a.color)}
                    className="peer sr-only"
                  />
                  <span className="sr-only">{a.name}</span>
                  <span
                    aria-hidden="true"
                    className="block size-8 rounded-full border-2 border-transparent peer-checked:border-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary"
                    style={{ backgroundColor: a.color }}
                  />
                </label>
              ))}
              <label className="flex h-8 cursor-pointer items-center gap-1 rounded-full border border-border px-2 text-xs focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary">
                Other
                <input
                  type="color"
                  aria-label="Other accent colour"
                  value={draft.accent}
                  onChange={(ev) => set("accent", ev.target.value)}
                  className="size-4 cursor-pointer border-0 bg-transparent p-0 outline-none"
                />
              </label>
            </div>
            {e.accent || !accentOk ? (
              <p role="alert" className="text-sm text-danger">
                {e.accent ?? "That colour is hard to read on the dark background. Pick a lighter one."}
              </p>
            ) : (
              <p className="text-sm text-muted">Checked so text stays readable on the dark background.</p>
            )}
          </fieldset>
        </Panel>

        <Panel title="About & contact">
          <TextArea
            label="About your shop"
            name="about"
            rows={5}
            maxLength={4000}
            hint="Shown on your About page and, shortened, in the footer."
            value={draft.about}
            onChange={(ev) => set("about", ev.target.value)}
            error={e.about}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Phone" name="phone" type="tel" placeholder="0917 123 4567" value={draft.contact.phone} onChange={(ev) => setContact("phone", ev.target.value)} error={e.phone} />
            <TextField label="Email" name="email" type="email" value={draft.contact.email} onChange={(ev) => setContact("email", ev.target.value)} error={e.email} />
          </div>
          <TextArea label="Address" name="address" rows={2} maxLength={300} placeholder="Optional" value={draft.contact.address} onChange={(ev) => setContact("address", ev.target.value)} error={e.address} />
          <div className="grid gap-4 sm:grid-cols-2">
            {SOCIALS.map((s) => (
              <TextField
                key={s.key}
                label={s.label}
                name={`social.${s.key}`}
                inputMode="url"
                autoCapitalize="none"
                spellCheck={false}
                placeholder={s.placeholder}
                value={draft.socials[s.key]}
                onChange={(ev) => setSocial(s.key, ev.target.value)}
                error={e[`social.${s.key}`]}
              />
            ))}
          </div>
        </Panel>

        {state.message && <FormAlert tone="success">{state.message}</FormAlert>}
        {state.error && <FormAlert>{state.error}</FormAlert>}
        <div className="flex items-center justify-end gap-3">
          {busy ? (
            <p className="text-sm text-muted">Wait for the image to finish uploading.</p>
          ) : (
            !accentOk && <p className="text-sm text-muted">Pick a readable accent colour to save.</p>
          )}
          <Button size="sm" pendingLabel="Saving…" disabled={busy || !accentOk}>
            Save branding
          </Button>
        </div>
      </form>

      <section aria-label="Live preview" className="flex flex-col gap-2 lg:sticky lg:top-8 lg:h-[calc(100dvh-4rem)]">
        <p className="text-sm text-muted">Live preview. Changes show here as you type and go live when you save.</p>
        {shopUrl ? (
          <iframe ref={frame} src={shopUrl} title="Shop preview" className="h-[600px] w-full flex-1 rounded-xl border border-border bg-background lg:h-auto" />
        ) : (
          <p className="text-sm text-muted">Set SHOP_URL to see the live preview.</p>
        )}
      </section>
    </div>
  );
}
