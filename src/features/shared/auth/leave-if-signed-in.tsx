"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Seller site login and sign-up forms: if this browser is already signed in, leave at once.
 * The browser's Back button shows a saved copy of the page without asking the server,
 * so this runs when the form appears and when the page is restored from the back cache.
 * "/" is the dashboard on the seller site.
 */
export function LeaveIfSignedIn({ next }: { next?: string }) {
  const router = useRouter();

  useEffect(() => {
    const target = next ?? "/";
    const check = async () => {
      const { data } = await createClient().auth.getSession();
      if (data.session) {
        router.replace(target);
        router.refresh();
      }
    };
    check();
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) check();
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [next, router]);

  return null;
}
