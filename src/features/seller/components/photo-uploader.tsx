"use client";

import { shrinkImage } from "../lib/shrink-image";
import Image from "next/image";
import { useEffect, useId, useState } from "react";
import { ASSETS_BUCKET } from "@/features/shared/lib/storage";
import { secondaryButtonClasses } from "@/features/shared/ui/button-styles";
import { createClient } from "@/lib/supabase/client";

export type Photo = { path: string; alt: string; url: string };

const MAX_PHOTOS = 12;
const MAX_BYTES = 5 * 1024 * 1024; // matches the bucket's file_size_limit
const TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Uploads straight to Supabase Storage under {storeId}/products/ (storage RLS allows
 * only the store's members), then hands the ordered list to the form as JSON.
 * The list lives in the parent so it survives the form being re-mounted.
 */
export function PhotoUploader({
  storeId,
  photos,
  setPhotos,
  onBusyChange,
}: {
  storeId: string;
  photos: Photo[];
  setPhotos: React.Dispatch<React.SetStateAction<Photo[]>>;
  /** Told while uploads are running, so the form can wait before saving. */
  onBusyChange?: (busy: boolean) => void;
}) {
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  useEffect(() => onBusyChange?.(uploading > 0), [uploading, onBusyChange]);

  async function upload(files: FileList) {
    setError(null);
    const room = MAX_PHOTOS - photos.length;
    const list = [...files].slice(0, room);
    if (files.length > room) setError(`You can add up to ${MAX_PHOTOS} photos.`);

    const supabase = createClient();
    for (const original of list) {
      if (!TYPES.includes(original.type)) {
        setError("Use JPG, PNG or WebP photos.");
        continue;
      }
      // Smaller before upload (at most 1280 px, WebP): less storage, faster pages.
      const file = await shrinkImage(original);
      if (file.size > MAX_BYTES) {
        setError(`${file.name} is over 5 MB. Use a smaller photo.`);
        continue;
      }
      setUploading((n) => n + 1);
      const ext = file.type.split("/")[1].replace("jpeg", "jpg");
      const path = `${storeId}/products/${crypto.randomUUID()}.${ext}`;
      const { error: err } = await supabase.storage.from(ASSETS_BUCKET).upload(path, file, { contentType: file.type });
      setUploading((n) => n - 1);
      if (err) {
        setError(`${file.name} couldn't be uploaded. Try again.`);
        continue;
      }
      const url = supabase.storage.from(ASSETS_BUCKET).getPublicUrl(path).data.publicUrl;
      setPhotos((p) => [...p, { path, alt: "", url }]);
    }
  }

  const move = (from: number, to: number) =>
    setPhotos((p) => {
      const next = [...p];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="images" value={JSON.stringify(photos.map(({ path, alt }) => ({ path, alt })))} />

      {photos.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo, i) => (
            <li key={photo.path} className="flex flex-col gap-2">
              <div className="relative aspect-square overflow-hidden rounded-lg bg-border">
                <Image src={photo.url} alt={photo.alt || `Photo ${i + 1}`} fill sizes="200px" className="object-cover" />
                {i === 0 && (
                  <span className="absolute top-2 left-2 rounded-full bg-surface px-2 py-0.5 text-xs font-medium">Cover</span>
                )}
              </div>
              <div className="flex gap-1">
                <button type="button" className={secondaryButtonClasses("xs")} disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`Move photo ${i + 1} earlier`}>
                  ←
                </button>
                <button
                  type="button"
                  className={secondaryButtonClasses("xs")}
                  disabled={i === photos.length - 1}
                  onClick={() => move(i, i + 1)}
                  aria-label={`Move photo ${i + 1} later`}
                >
                  →
                </button>
                <button
                  type="button"
                  className={`${secondaryButtonClasses("xs", "danger")} ml-auto`}
                  onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {photos.length < MAX_PHOTOS && (
        <label
          htmlFor={inputId}
          className="flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-sm text-muted hover:bg-background focus-within:outline-2 focus-within:outline-primary"
        >
          <span className="font-medium text-foreground">{uploading > 0 ? "Uploading…" : "Add photos"}</span>
          <span>JPG, PNG or WebP, up to 5 MB each. The first photo is the cover.</span>
          <input
            id={inputId}
            type="file"
            accept={TYPES.join(",")}
            multiple
            className="sr-only"
            disabled={uploading > 0}
            onChange={(e) => {
              if (e.target.files?.length) upload(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
