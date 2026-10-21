"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatPrice } from "@/features/shared/lib/money";
import { focusRingClasses, secondaryButtonClasses } from "@/features/shared/ui/button-styles";
import type { LatestOrder } from "../queries/orders";

/**
 * Watches for new orders while the admin is open: every `every` ms it asks for the newest order.
 * A new one plays a short sound, shows a card in the corner, puts "(n) New order" in the tab
 * title (so a background tab shows it), and refreshes the page so lists and badges update.
 */
export function NewOrderAlert({
  initial,
  check,
  every = 20_000,
}: {
  initial: LatestOrder;
  check: () => Promise<LatestOrder>;
  every?: number;
}) {
  const router = useRouter();
  const lastNo = useRef(initial?.orderNo ?? 0);
  const [fresh, setFresh] = useState<NonNullable<LatestOrder>[]>([]);
  const audio = useRef<AudioContext | null>(null);

  // Browsers only allow sound after the user has interacted with the page once.
  useEffect(() => {
    const unlock = () => {
      audio.current ??= new AudioContext();
      void audio.current.resume();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      let latest: LatestOrder = null;
      try {
        latest = await check();
      } catch {
        return; // offline or signed out: try again next time
      }
      if (stopped || !latest || latest.orderNo <= lastNo.current) return;
      lastNo.current = latest.orderNo;
      setFresh((list) => [latest, ...list].slice(0, 3));
      chime(audio.current);
      router.refresh();
    };
    const timer = window.setInterval(poll, every);
    const onFocus = () => void poll();
    window.addEventListener("focus", onFocus);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [check, every, router]);

  // "(2) New order · Orders · Artzwork PC" in the tab until the cards are dismissed. Next sets a new
  // title on every navigation, so it is put back whenever the page changes.
  const pathname = usePathname();
  useEffect(() => {
    if (fresh.length === 0) return;
    const apply = () => {
      const base = document.title.replace(/^\(\d+\) New orders? · /, "");
      document.title = `(${fresh.length}) New order${fresh.length === 1 ? "" : "s"} · ${base}`;
    };
    apply();
    const timer = window.setTimeout(apply, 300); // after Next has written the new page's title
    return () => {
      window.clearTimeout(timer);
      document.title = document.title.replace(/^\(\d+\) New orders? · /, "");
    };
  }, [fresh, pathname]);

  // The live region is always on the page, so screen readers announce cards added to it.
  return (
    <div role="status" aria-live="polite" className="fixed right-4 bottom-4 z-30 flex w-[calc(100%-2rem)] max-w-xs flex-col gap-2 empty:hidden print:hidden">
      {fresh.map((o) => (
        <div key={o.id} className="flex flex-col gap-2 rounded-xl border border-primary/40 bg-surface p-4 text-sm">
          <p className="font-semibold">New order #{o.orderNo}</p>
          <p className="text-muted">
            {o.customer ? `${o.customer} · ` : ""}
            <span className="tabular-nums">{formatPrice(o.total)}</span>
          </p>
          <div className="flex items-center justify-between gap-2">
            <Link
              href={`/orders/${o.id}`}
              onClick={() => setFresh((list) => list.filter((x) => x.id !== o.id))}
              className={`font-medium text-primary hover:underline ${focusRingClasses}`}
            >
              View order
            </Link>
            <button
              type="button"
              aria-label={`Dismiss new order #${o.orderNo}`}
              className={secondaryButtonClasses("xs")}
              onClick={() => setFresh((list) => list.filter((x) => x.id !== o.id))}
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Two short tones; silent until the page has been clicked once (browser rule). */
function chime(ctx: AudioContext | null) {
  if (!ctx || ctx.state !== "running") return;
  [880, 1320].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + i * 0.18;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.18);
  });
}
