"use client";

import { useActionState, useState } from "react";
import { toPesoInput } from "@/features/shared/lib/money";
import { Button } from "@/features/shared/ui/button";
import { Checkbox } from "@/features/shared/ui/checkbox";
import { FormAlert } from "@/features/shared/ui/form-alert";
import { TextArea } from "@/features/shared/ui/text-area";
import { TextField } from "@/features/shared/ui/text-field";
import { saveProduct, type ProductFormState } from "../actions/products";
import type { EditableProduct, ProductOptions } from "../queries/products";
import { OrganizeFields } from "./organize-fields";
import { PhotoUploader, type Photo } from "./photo-uploader";
import { Panel } from "./seller-shell";

/** Add or edit a product. After a failed save the fields start from what was submitted (React resets forms after an action). */
export function ProductForm({
  storeId,
  product,
  options,
}: {
  storeId: string;
  product?: EditableProduct;
  options: ProductOptions;
}) {
  const [state, action] = useActionState<ProductFormState, FormData>(saveProduct, {});
  const e = state.fieldErrors ?? {};
  const v = state.values;
  const [photos, setPhotos] = useState<Photo[]>(product?.images ?? []);
  const [uploading, setUploading] = useState(false);
  // A new product that saved but then failed on photos or labels: retry as an update, not a duplicate.
  const productId = product?.id ?? state.productId;

  return (
    <form action={action} className="flex flex-col gap-6" key={JSON.stringify(v ?? null)}>
      {productId && <input type="hidden" name="id" value={productId} />}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          <Panel title="Details">
            <TextField label="Name" name="name" required maxLength={120} defaultValue={v?.name ?? product?.name} error={e.name} />
            <TextArea
              label="Description"
              name="description"
              maxLength={10000}
              defaultValue={v?.description ?? product?.description}
              hint="What it is, size, materials, care."
              error={e.description}
            />
          </Panel>

          <Panel title="Photos">
            <PhotoUploader storeId={storeId} photos={photos} setPhotos={setPhotos} onBusyChange={setUploading} />
          </Panel>

          <Panel title="Price">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Price"
                name="price"
                prefix="₱"
                inputMode="decimal"
                required
                placeholder="0.00"
                defaultValue={v?.price ?? toPesoInput(product?.price)}
                error={e.price}
              />
              <TextField
                label="Sale price"
                name="salePrice"
                prefix="₱"
                inputMode="decimal"
                placeholder="Optional"
                defaultValue={v?.salePrice ?? toPesoInput(product?.salePrice)}
                hint="Shown with the price crossed out."
                error={e.salePrice}
              />
            </div>
          </Panel>

          <Panel title="Stock">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Quantity"
                name="stock"
                type="number"
                min={0}
                step={1}
                required
                defaultValue={v?.stock ?? product?.stock ?? 0}
                error={e.stock}
              />
              <TextField
                label="Low stock alert at"
                name="lowStockThreshold"
                type="number"
                min={0}
                step={1}
                defaultValue={v?.lowStockThreshold ?? product?.lowStockThreshold ?? 5}
                hint="Shows on the dashboard at or below this."
                error={e.lowStockThreshold}
              />
            </div>
            <Checkbox
              name="isSoldOut"
              variant="switch"
              label="Mark as sold out"
              hint="Customers can't order it, whatever the quantity."
              defaultChecked={v?.isSoldOut ?? product?.isSoldOut}
            />
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <Panel title="Visibility">
            <Checkbox
              name="isVisible"
              variant="switch"
              label="Show in shop"
              hint="Hidden products stay here but customers can't see them."
              defaultChecked={v?.isVisible ?? product?.isVisible ?? true}
            />
          </Panel>

          <Panel title="Organize">
            <OrganizeFields
              options={options}
              categoryId={v?.categoryId ?? product?.categoryId ?? ""}
              labelIds={v?.labelIds ?? product?.labelIds ?? []}
              newCategory={v?.newCategory}
              newLabels={v?.newLabels}
              categoryError={e.newCategory}
              labelsError={e.labels}
            />
          </Panel>
        </div>
      </div>

      {state.error && <FormAlert>{state.error}</FormAlert>}
      <div className="flex items-center justify-end gap-3">
        {uploading && <p className="text-sm text-muted">Wait for the photos to finish uploading.</p>}
        <Button size="sm" pendingLabel="Saving…" disabled={uploading}>
          {product ? "Save changes" : "Add product"}
        </Button>
      </div>
    </form>
  );
}
