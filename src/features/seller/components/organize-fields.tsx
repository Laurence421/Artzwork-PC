"use client";

import { useId, useState } from "react";
import { Badge } from "@/features/shared/ui/badge";
import { secondaryButtonClasses } from "@/features/shared/ui/button-styles";
import { Checkbox } from "@/features/shared/ui/checkbox";
import { Select } from "@/features/shared/ui/select";
import { TextField } from "@/features/shared/ui/text-field";
import { MAX_NEW_LABELS, NEW_CATEGORY, type NewLabel } from "../lib/organize";
import type { ProductOptions } from "../queries/products";

// Label colours to pick from (label data, not theme values); any colour is allowed through "Other".
const SWATCHES = [
  { name: "Red", color: "#dc2626" },
  { name: "Orange", color: "#ea580c" },
  { name: "Amber", color: "#d97706" },
  { name: "Green", color: "#16a34a" },
  { name: "Teal", color: "#0891b2" },
  { name: "Blue", color: "#2563eb" },
  { name: "Indigo", color: "#4f46e5" },
  { name: "Purple", color: "#9333ea" },
  { name: "Pink", color: "#db2777" },
  { name: "Slate", color: "#475569" },
];

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Category and labels, set right on the product: pick an existing one or add a new one here.
 * New ones are created when the product is saved, and can be reused on other products.
 */
export function OrganizeFields({
  options,
  categoryId,
  labelIds,
  newCategory,
  newLabels: initialNewLabels,
  categoryError,
  labelsError,
}: {
  options: ProductOptions;
  categoryId: string;
  labelIds: string[];
  newCategory?: string;
  newLabels?: NewLabel[];
  categoryError?: string;
  labelsError?: string;
}) {
  const labelsErrorId = useId();
  const [category, setCategory] = useState(categoryId);
  const [newLabels, setNewLabels] = useState<NewLabel[]>(initialNewLabels ?? []);
  const [draft, setDraft] = useState<NewLabel>({ text: "", color: SWATCHES[0].color });

  const draftText = draft.text.trim();
  const draftExists = [...options.labels, ...newLabels].some((l) => sameText(l.text, draftText));
  const full = newLabels.length >= MAX_NEW_LABELS;
  const canAdd = draftText !== "" && !draftExists && !full;

  const addDraft = () => {
    if (!canAdd) return;
    setNewLabels((l) => [...l, { text: draftText, color: draft.color }]);
    setDraft((d) => ({ ...d, text: "" }));
  };

  // A label typed but not yet added is saved too, so nothing typed is lost.
  const submitted = canAdd ? [...newLabels, { text: draftText, color: draft.color }] : newLabels;

  return (
    <>
      <Select
        label="Category"
        name="categoryId"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        options={[
          { value: "", label: "No category" },
          ...options.categories.map((c) => ({ value: c.id, label: c.name })),
          { value: NEW_CATEGORY, label: "+ New category…" },
        ]}
      />
      {category === NEW_CATEGORY && (
        <TextField
          label="New category name"
          name="newCategory"
          required
          maxLength={60}
          placeholder="e.g. Monitors"
          defaultValue={newCategory}
          error={categoryError}
        />
      )}

      <fieldset className="flex flex-col gap-2" aria-describedby={labelsError ? labelsErrorId : undefined}>
        <legend className="mb-1.5 text-sm font-medium">Labels</legend>
        {options.labels.length === 0 && newLabels.length === 0 && (
          <p className="text-sm text-muted">No labels yet. Add one below.</p>
        )}
        {options.labels.map((l) => (
          <Checkbox
            key={l.id}
            name="labelIds"
            value={l.id}
            defaultChecked={labelIds.includes(l.id)}
            label={<Badge text={l.text} color={l.color} />}
          />
        ))}
        {newLabels.map((l, i) => (
          <div key={`${l.text}-${i}`} className="flex items-center gap-3">
            <Badge text={l.text} color={l.color} />
            <span className="text-xs text-muted">New, saved with the product</span>
            <button
              type="button"
              className={`${secondaryButtonClasses("xs")} ml-auto`}
              onClick={() => setNewLabels((all) => all.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </div>
        ))}
        {labelsError && (
          <p id={labelsErrorId} className="text-sm text-danger">
            {labelsError}
          </p>
        )}
        <input type="hidden" name="newLabels" value={JSON.stringify(submitted)} />
      </fieldset>

      {/* Add a label: not a nested form, so Enter in the text adds it instead of saving the product. */}
      <div className="flex flex-col gap-3 rounded-xl border border-border p-3">
        <TextField
          label="Add a label"
          maxLength={24}
          placeholder="e.g. Limited"
          value={draft.text}
          onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addDraft();
            }
          }}
          hint={
            full
              ? `You can add up to ${MAX_NEW_LABELS} new labels at a time. Save, then add more.`
              : draftExists
                ? "That label already exists. Tick it above."
                : undefined
          }
        />
        {/* Native radios: one Tab stop, arrow keys move between colours. The name is ignored on save. */}
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">Colour</legend>
          <div className="flex flex-wrap items-center gap-2">
            {SWATCHES.map((s) => (
              <label key={s.color} className="cursor-pointer" title={s.name}>
                <input
                  type="radio"
                  name="draftLabelColour"
                  value={s.color}
                  checked={draft.color === s.color}
                  onChange={() => setDraft((d) => ({ ...d, color: s.color }))}
                  className="peer sr-only"
                />
                <span className="sr-only">{s.name}</span>
                <span
                  aria-hidden="true"
                  className="block size-7 rounded-full border-2 border-transparent peer-checked:border-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary"
                  style={{ backgroundColor: s.color }}
                />
              </label>
            ))}
            <label className="flex h-7 cursor-pointer items-center gap-1 rounded-full border border-border px-2 text-xs focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary">
              Other
              <input
                type="color"
                aria-label="Other colour"
                value={draft.color}
                onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
                className="size-4 cursor-pointer border-0 bg-transparent p-0 outline-none"
              />
            </label>
          </div>
        </fieldset>
        <div className="flex items-center gap-3">
          {draftText && <Badge text={draftText} color={draft.color} />}
          <button
            type="button"
            className={`${secondaryButtonClasses("sm")} ml-auto`}
            disabled={!canAdd}
            onClick={addDraft}
          >
            + Add label
          </button>
        </div>
      </div>
    </>
  );
}
