const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

/** Money is stored as integer centavos: 125000 -> "₱1,250.00". */
export function formatPrice(centavos: number) {
  return peso.format(centavos / 100);
}

/** What a seller types -> centavos: "1,250.5" -> 125050. Null if it isn't a valid amount. */
export function parsePesos(input: string): number | null {
  const clean = input.replace(/[₱,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

/** Centavos -> the plain number a price input shows: 125050 -> "1250.50". */
export function toPesoInput(centavos: number | null | undefined) {
  return centavos == null ? "" : (centavos / 100).toFixed(2);
}

/** Whole-number discount for a sale: (100000, 80000) -> 20. Rounded down so it never overstates. */
export function discountPercent(price: number, salePrice: number) {
  return price > 0 ? Math.floor(((price - salePrice) / price) * 100) : 0;
}
