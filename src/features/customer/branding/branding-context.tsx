"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { accentStyle, isReadableAccent, PREVIEW_MESSAGE, safeUrl, SOCIALS, type Branding } from "@/features/shared/lib/branding";

const BrandingContext = createContext<Branding | null>(null);

export function useBranding(): Branding {
  const b = useContext(BrandingContext);
  if (!b) throw new Error("useBranding outside BrandingProvider");
  return b;
}

/** Only well-formed text, https links, and a readable accent are taken from a preview message. */
function sanitize(draft: unknown, fallback: Branding): Branding {
  if (!draft || typeof draft !== "object") return fallback;
  const d = draft as Partial<Branding>;
  const text = (v: unknown, max: number, f: string) => (typeof v === "string" ? v.slice(0, max) : f);
  // Only images from this project's own storage (the only host next/image allows).
  const storage = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const img = (v: unknown, f: string | null) => {
    if (v === null) return null;
    const url = safeUrl(v);
    return url && storage && url.startsWith(`${storage}/storage/v1/object/public/`) ? url : f;
  };
  return {
    name: text(d.name, 80, fallback.name) || fallback.name,
    tagline: text(d.tagline, 160, fallback.tagline),
    logoUrl: img(d.logoUrl, fallback.logoUrl),
    faviconUrl: fallback.faviconUrl,
    bannerUrl: img(d.bannerUrl, fallback.bannerUrl),
    announcement: text(d.announcement, 160, fallback.announcement),
    instalment: text(d.instalment, 160, fallback.instalment),
    about: text(d.about, 4000, fallback.about),
    contact: {
      phone: text(d.contact?.phone, 30, fallback.contact.phone),
      email: text(d.contact?.email, 120, fallback.contact.email),
      address: text(d.contact?.address, 300, fallback.contact.address),
    },
    socials: Object.fromEntries(
      SOCIALS.map((s) => [s.key, d.socials && s.key in d.socials ? safeUrl(d.socials[s.key]) : fallback.socials[s.key]]),
    ) as Branding["socials"],
    accent: typeof d.accent === "string" && isReadableAccent(d.accent) ? d.accent : fallback.accent,
  };
}

/**
 * The shop's branding for every shop page, and the shop's accent colour.
 * When the shop is open inside the Branding page's preview, that page (and only that
 * origin) can send unsaved changes; they change only this preview, never the saved shop.
 */
export function BrandingProvider({
  initial,
  previewOrigin,
  children,
}: {
  initial: Branding;
  previewOrigin?: string;
  children: React.ReactNode;
}) {
  // Only a preview draft lives in state; otherwise the saved branding from the server is used,
  // so a save shows up on the next navigation instead of keeping the first value.
  const [draft, setDraft] = useState<Branding | null>(null);
  const branding = draft ?? initial;

  useEffect(() => {
    if (!previewOrigin || window.parent === window) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== previewOrigin || e.data?.type !== PREVIEW_MESSAGE) return;
      setDraft(sanitize(e.data.branding, initial));
    };
    window.addEventListener("message", onMessage);
    // Tell the Branding page the preview is listening, so it sends the current draft.
    window.parent.postMessage({ type: `${PREVIEW_MESSAGE}:ready` }, previewOrigin);
    return () => window.removeEventListener("message", onMessage);
  }, [previewOrigin, initial]);

  return (
    <BrandingContext.Provider value={branding}>
      <div className="flex min-h-full flex-1 flex-col" style={accentStyle(branding.accent) as React.CSSProperties}>
        {children}
      </div>
    </BrandingContext.Provider>
  );
}
