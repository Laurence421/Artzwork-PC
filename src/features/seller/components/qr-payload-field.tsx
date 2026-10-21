"use client";

import jsQR from "jsqr";
import { useEffect, useState } from "react";
import { isQrPh, qrPhName } from "@/features/shared/lib/qrph";

type Status = { kind: "none" | "reading" | "ok" | "other" | "unreadable"; payload: string };

/**
 * Reads the QR code inside the uploaded GCash / bank QR image and keeps its text in a hidden field,
 * so each order page can show the same QR with the order's amount already filled in.
 */
export function QrPayloadField({ name, imageUrl, initial }: { name: string; imageUrl: string | null; initial: string | null }) {
  // The image the saved code belongs to, and the last image read in this browser.
  const [savedFor] = useState(imageUrl);
  const [read, setRead] = useState<(Status & { url: string }) | null>(null);
  const savedOk = !!initial && isQrPh(initial) && imageUrl === savedFor;

  const status: Status = !imageUrl
    ? { kind: "none", payload: "" }
    : savedOk
      ? { kind: "ok", payload: initial! }
      : read?.url === imageUrl
        ? read
        : { kind: "reading", payload: "" };

  useEffect(() => {
    if (!imageUrl || savedOk) return;
    let cancelled = false;
    readQr(imageUrl).then((text) => {
      if (cancelled) return;
      const kind: Status["kind"] = !text ? "unreadable" : isQrPh(text) ? "ok" : "other";
      setRead({ url: imageUrl, kind, payload: kind === "ok" ? text! : "" });
    });
    return () => {
      cancelled = true;
    };
  }, [imageUrl, savedOk]);

  return (
    <>
      <input type="hidden" name={name} value={status.payload} />
      {status.kind !== "none" && (
        <p className={`text-sm ${status.kind === "ok" ? "text-muted" : status.kind === "reading" ? "text-muted" : "text-danger"}`}>
          {status.kind === "reading" && "Reading the QR code…"}
          {status.kind === "ok" &&
            `QR Ph code read${qrPhName(status.payload) ? ` (${qrPhName(status.payload)})` : ""}. Customers get this QR with their order's exact amount already filled in.`}
          {status.kind === "other" && "This QR isn't a GCash or bank payment code (QR Ph), so customers will type the amount themselves."}
          {status.kind === "unreadable" && "Couldn't find a QR code in this image. Upload a clear, straight picture of the QR, or customers will type the amount."}
        </p>
      )}
    </>
  );
}

/** Finds and reads the QR code in an image (in the browser; nothing is sent anywhere). */
async function readQr(url: string): Promise<string | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    await img.decode();
    // Try the image at a few sizes: phone screenshots are large, cropped QR images small.
    for (const size of [1000, 600, 1600]) {
      const scale = Math.min(1, size / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, w, h);
      const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h);
      if (code?.data) return code.data;
    }
    return null;
  } catch {
    return null;
  }
}
