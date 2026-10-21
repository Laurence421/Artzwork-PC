// The shop's own look and content, stored in stores.branding / stores.theme (jsonb).
// Shared by the seller's Branding page (edits it) and the shop (shows it).

// Keep these three in sync with src/app/globals.css (--primary, --surface, --primary-foreground):
// the readability check runs in JS, so it needs the values themselves.
/** The shop's default accent: the theme's --primary. */
export const DEFAULT_ACCENT = "#8b9bff";
/** Card colour the accent must stay readable on (the theme's --surface). */
const SURFACE = "#0f1640";
/** Readable text on the accent, as the theme's --primary-foreground does. */
const DARK_INK = "#070b24";
const LIGHT_INK = "#ffffff";

export type SocialKey = "facebook" | "instagram" | "tiktok" | "messenger";
export const SOCIALS: { key: SocialKey; label: string; placeholder: string }[] = [
  { key: "facebook", label: "Facebook", placeholder: "https://facebook.com/artzworkpc" },
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/artzworkpc" },
  { key: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@artzworkpc" },
  { key: "messenger", label: "Messenger", placeholder: "https://m.me/artzworkpc" },
];

/** As stored. Paths are inside the store-assets bucket. */
export type StoredBranding = {
  logo_path?: string;
  favicon_path?: string;
  banner_path?: string;
  announcement?: string;
  /** e.g. "Instalment available via Salmon. Message us to apply." Shown on product pages. */
  instalment?: string;
  about?: string;
  contact?: { phone?: string; email?: string; address?: string };
  socials?: Partial<Record<SocialKey, string>>;
};
export type StoredTheme = { accent?: string };

/** What the shop shows: everything resolved, image paths turned into URLs. */
export type Branding = {
  name: string;
  tagline: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  bannerUrl: string | null;
  announcement: string;
  instalment: string;
  about: string;
  contact: { phone: string; email: string; address: string };
  socials: Record<SocialKey, string>;
  accent: string;
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export function resolveBranding(
  store: { name: string; tagline: string | null; branding: unknown; theme: unknown },
  imageUrl: (path: string) => string,
): Branding {
  const b = (store.branding && typeof store.branding === "object" ? store.branding : {}) as StoredBranding;
  const t = (store.theme && typeof store.theme === "object" ? store.theme : {}) as StoredTheme;
  const path = (p: unknown) => (typeof p === "string" && p ? imageUrl(p) : null);
  return {
    name: store.name,
    tagline: store.tagline ?? "",
    logoUrl: path(b.logo_path),
    faviconUrl: path(b.favicon_path),
    bannerUrl: path(b.banner_path),
    announcement: str(b.announcement, 160),
    instalment: str(b.instalment, 160),
    about: str(b.about, 4000),
    contact: { phone: str(b.contact?.phone, 30), email: str(b.contact?.email, 120), address: str(b.contact?.address, 300) },
    socials: Object.fromEntries(SOCIALS.map((s) => [s.key, safeUrl(b.socials?.[s.key])])) as Record<SocialKey, string>,
    accent: typeof t.accent === "string" && HEX.test(t.accent) && isReadableAccent(t.accent) ? t.accent : DEFAULT_ACCENT,
  };
}

/** Only https links are shown (no javascript: or other schemes). */
export function safeUrl(v: unknown): string {
  if (typeof v !== "string" || !v) return "";
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? u.toString() : "";
  } catch {
    return "";
  }
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Links in the accent colour must stay readable on the dark cards (4.5:1, like body text). */
export function isReadableAccent(hex: string) {
  return HEX.test(hex) && contrast(hex, SURFACE) >= 4.5;
}

/** Button text on the accent: whichever of the theme's dark ink or white reads better. */
export function accentForeground(hex: string) {
  return contrast(hex, DARK_INK) >= contrast(hex, LIGHT_INK) ? DARK_INK : LIGHT_INK;
}

/** CSS variables that recolour the shop's buttons and links (the theme reads --primary). */
export function accentStyle(accent: string): Record<string, string> {
  return { "--primary": accent, "--primary-foreground": accentForeground(accent) };
}

/** Message the Branding page sends to the shop preview iframe. */
export const PREVIEW_MESSAGE = "artzwork:branding-preview";
