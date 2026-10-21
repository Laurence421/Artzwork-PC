"use client";

import Image from "next/image";
import { useState } from "react";
import { focusRingClasses } from "@/features/shared/ui/button-styles";

/** Product photos: one large, thumbnails below switch which one is shown. */
export function ProductGallery({ images }: { images: { url: string; alt: string }[] }) {
  const [active, setActive] = useState(0);
  const shown = images[active];

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square overflow-hidden rounded-xl bg-border">
        {shown && <Image src={shown.url} alt={shown.alt} fill priority sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />}
      </div>
      {images.length > 1 && (
        <ul className="grid grid-cols-4 gap-3">
          {images.map((img, i) => (
            <li key={img.url}>
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Show photo ${i + 1} of ${images.length}`}
                aria-pressed={i === active}
                className={`relative block aspect-square w-full cursor-pointer overflow-hidden rounded-lg border-2 bg-border ${
                  i === active ? "border-primary" : "border-transparent"
                } ${focusRingClasses}`}
              >
                <Image src={img.url} alt="" fill sizes="120px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
