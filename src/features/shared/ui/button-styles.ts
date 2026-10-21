// Shared by Button and by links that look like buttons (server components can't call into "use client" files).
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const disabled = "disabled:cursor-not-allowed disabled:opacity-60";

const base = `inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition duration-300 hover:-translate-y-0.5 hover:shadow-glow active:translate-y-0 disabled:hover:translate-y-0 disabled:hover:shadow-none ${focusRing} ${disabled}`;

const sizes = {
  /** Full-width form button. */
  md: "h-10 w-full",
  /** Compact button, e.g. in the nav bar. */
  sm: "h-9 px-4",
};

export type ButtonSize = keyof typeof sizes;

export function buttonClasses(size: ButtonSize = "md") {
  return `${base} ${sizes[size]}`;
}

const secondarySizes = {
  /** Full-width, same height as the primary form Button. */
  md: "h-10 w-full px-3 text-sm",
  sm: "h-9 px-3 text-sm",
  /** Tiny controls inside a card, e.g. photo order buttons. */
  xs: "h-8 px-2 text-xs",
};

/** Bordered secondary button; tone "danger" for destructive actions like Delete. */
export function secondaryButtonClasses(size: keyof typeof secondarySizes = "sm", tone: "default" | "danger" = "default") {
  return `inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-border bg-surface font-medium transition duration-300 hover:border-primary/50 hover:bg-surface-2 ${
    tone === "danger" ? "text-danger" : ""
  } ${secondarySizes[size]} ${focusRing} ${disabled}`;
}

/** Focus ring for custom controls (nav items, bare checkboxes) so keyboard focus looks the same everywhere. */
export const focusRingClasses = focusRing;
