// Couriers the seller can pick when marking an order shipped. The shop has no riders of its own.
// `site` is the courier's own website, where customers can look up a tracking number; on-demand
// riders (Lalamove, Grab) have none, so the seller pastes the trip's share link instead.
export const COURIERS = [
  { name: "J&T Express", site: "https://www.jtexpress.ph" },
  { name: "LBC Express", site: "https://www.lbcexpress.com" },
  { name: "Ninja Van", site: "https://www.ninjavan.co/en-ph" },
  { name: "Flash Express", site: "https://www.flashexpress.ph" },
  { name: "JRS Express", site: "https://www.jrs-express.com" },
  { name: "Lalamove", site: null },
  { name: "Grab Express", site: null },
] as const;

/** Where "Track parcel" goes: the link the seller pasted, else the courier's website. */
export function trackingLink(courier: string | null | undefined, url: string | null | undefined): string | null {
  if (url) return url;
  return COURIERS.find((c) => c.name === courier)?.site ?? null;
}

export type ShippingKind = "delivery" | "pickup";

/** Delivery options are "delivery" unless the seller made them store pickup. */
export function isPickup(option: { kind?: string } | null | undefined) {
  return option?.kind === "pickup";
}
