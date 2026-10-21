"use client";

import { useEffect, type RefObject } from "react";

/**
 * Every modal <dialog> uses this. Next keeps a page we navigate away from mounted but hidden
 * (<Activity>, with cacheComponents on). A modal dialog left open there would still block every
 * click on the new page, so it closes when its page hides or unmounts.
 */
export function useCloseOnHide(ref: RefObject<HTMLDialogElement | null>) {
  useEffect(() => {
    const dialog = ref.current;
    return () => dialog?.close();
  }, [ref]);
}
