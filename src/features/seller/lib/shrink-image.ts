// Shrinks a photo in the browser before it is uploaded, so the shop's free storage and every
// customer's data plan carry less: at most `maxSide` pixels on the long side (sharp on any phone), as WebP.
// A file that is already small (or would not get smaller) is uploaded as it is.

export async function shrinkImage(file: File, { maxSide = 1280, quality = 0.8 }: { maxSide?: number; quality?: number } = {}): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 150 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (!blob || blob.type !== "image/webp" || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
  } catch {
    return file; // an image the browser can't read: let the normal checks handle it
  }
}
