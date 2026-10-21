"use client";

import { useActionState } from "react";
import { Button } from "@/features/shared/ui/button";
import { FormAlert } from "@/features/shared/ui/form-alert";
import { TextField } from "@/features/shared/ui/text-field";
import { createStore, type CreateStoreState } from "../actions/create-store";

export function OnboardingForm() {
  const [state, action] = useActionState<CreateStoreState, FormData>(createStore, {});

  return (
    <form action={action} className="flex flex-col gap-4">
      <TextField
        label="Store name"
        name="name"
        placeholder="e.g. Artz Prints"
        required
        maxLength={80}
        defaultValue={state.values?.name}
        error={state.fieldErrors?.name}
      />
      {state.error && <FormAlert>{state.error}</FormAlert>}
      <Button pendingLabel="Creating…">Create store</Button>
    </form>
  );
}
