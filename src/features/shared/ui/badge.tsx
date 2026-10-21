// Text colours a label's own background can carry; textOn() picks the one with more contrast.
const LIGHT_TEXT = "#ffffff";
const DARK_TEXT = "#111827";

/** Relative luminance of a #rrggbb colour (sRGB, linearised), 0 (black) to 1 (white). */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Whichever of the two text colours reads better on this background. */
function textOn(background: string) {
  return contrast(background, LIGHT_TEXT) >= contrast(background, DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT;
}

/** A seller-defined label ("New", "Sale"). Its colour is the seller's data, not a theme value. */
export function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: color, color: textOn(color) }}
    >
      {text}
    </span>
  );
}
