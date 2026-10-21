"use client";

import { useActionState } from "react";
import { FormAlert } from "@/features/shared/ui/form-alert";
import { secondaryButtonClasses } from "@/features/shared/ui/button-styles";
import { ConfirmButton } from "@/features/shared/ui/confirm-button";
import { deleteProduct, type DeleteState } from "../actions/products";

/** Deletes one product after a confirm; shows a failure instead of leaving the page. */
export function DeleteProductButton({ productId, name }: { productId: string; name: string }) {
  const [state, action, pending] = useActionState<DeleteState, FormData>(deleteProduct.bind(null, productId), {});

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <FormAlert>{state.error}</FormAlert>}
      <ConfirmButton
        title={`Delete "${name}"?`}
        message="This can't be undone."
        confirmLabel="Delete"
        tone="danger"
        disabled={pending}
        className={`${secondaryButtonClasses("sm", "danger")} self-start`}
      >
        {pending ? "Deleting…" : "Delete"}
      </ConfirmButton>
    </form>
  );
}
