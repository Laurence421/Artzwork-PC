"use client";

import { shrinkImage } from "../lib/shrink-image";
import Image from "next/image";
import { useEffect, useId, useState } from "react";
import { ASSETS_BUCKET } from "@/features/shared/lib/storage";
import { secondaryButtonClasses } from "@/features/shared/ui/button-styles";
import { createClient } from "@/lib/supabase/client";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * One image (a payment QR code, logo, favicon or banner), uploaded to {storeId}/{folder}/
 * and sent with the form as its path. onChange reports the new URL (for the live preview).
 */
export function ImageUpload({
  storeId,
  folder,
  name,
  label,
  hint,
  uploadLabel = "Upload",
  previewClassName = "size-24",
  initialPath,
  initialUrl,
  error: savedError,
  onBusyChange,
  onChange,
}: {
  storeId: string;
  folder: "payments" | "branding";
  name: string;
  label: string;
  hint: string;
  uploadLabel?: string;
  /** Size and shape of the preview box, e.g. "size-24" or "aspect-[3/1] w-full max-w-sm". */
  previewClassName?: string;
  initialPath: string | null;
  initialUrl: string | null;
  error?: string;
  /** Told while an upload runs, so the form can wait before saving. */
  onBusyChange?: (busy: boolean) => void;
  onChange?: (url: string | null) => void;
}) {
  const [image, setImage] = useState<{ path: string; url: string } | null>(
    initialPath && initialUrl ? { path: initialPath, url: initialUrl } : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);

  async function upload(original: File) {
    setError(null);
    if (!TYPES.includes(original.type)) return setError("Use a JPG, PNG or WebP image.");
    // Smaller before upload; QR codes keep more detail so they still scan.
    const file = await shrinkImage(original, folder === "payments" ? { maxSide: 1200, quality: 0.95 } : {});
    if (file.size > MAX_BYTES) return setError("That image is over 5 MB. Use a smaller one.");
    setBusy(true);
    const supabase = createClient();
    const path = `${storeId}/${folder}/${crypto.randomUUID()}.${file.type.split("/")[1].replace("jpeg", "jpg")}`;
    const { error: err } = await supabase.storage.from(ASSETS_BUCKET).upload(path, file, { contentType: file.type });
    setBusy(false);
    if (err) return setError("The image couldn't be uploaded. Try again.");
    const url = supabase.storage.from(ASSETS_BUCKET).getPublicUrl(path).data.publicUrl;
    setImage({ path, url });
    onChange?.(url);
  }

  const shownError = error ?? savedError;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <input type="hidden" name={name} value={image?.path ?? ""} />
      <div className="flex flex-wrap items-center gap-3">
        {image && (
          <div className={`relative overflow-hidden rounded-lg border border-border bg-surface ${previewClassName}`}>
            <Image src={image.url} alt={label} fill sizes="384px" className="object-contain" />
          </div>
        )}
        <label htmlFor={inputId} className={`${secondaryButtonClasses("sm")} focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary`}>
          {busy ? "Uploading…" : image ? "Replace" : uploadLabel}
          <input
            id={inputId}
            type="file"
            accept={TYPES.join(",")}
            className="sr-only"
            aria-label={`${image ? "Replace" : "Upload"} ${label}`}
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
              e.target.value = "";
            }}
          />
        </label>
        {image && (
          <button type="button" className={secondaryButtonClasses("sm", "danger")} aria-label={`Remove ${label}`} onClick={() => {
              setImage(null);
              onChange?.(null);
            }}>
            Remove
          </button>
        )}
      </div>
      {shownError ? (
        <p role="alert" className="text-sm text-danger">
          {shownError}
        </p>
      ) : (
        <p className="text-sm text-muted">{hint}</p>
      )}
    </div>
  );
}
