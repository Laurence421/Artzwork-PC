// Shared by the product form (client) and saveProduct (server).

/** Category select value meaning "create a new category from the name field". */
export const NEW_CATEGORY = "__new";

/** A label typed into the product form, created when the product is saved. */
export type NewLabel = { text: string; color: string };

/** New labels per save; the form stops adding at this many. */
export const MAX_NEW_LABELS = 10;

/** Labels on one product, existing and new together. */
export const MAX_LABELS_PER_PRODUCT = 20;
