import Image from "next/image";
import Link from "next/link";
import { discountPercent, formatPrice } from "@/features/shared/lib/money";
import { Badge } from "@/features/shared/ui/badge";
import type { ShopProduct } from "../queries/catalog";

/** One product in the shop grid; the whole card opens the product page. */
/** eager: the first row, which is on screen when the page opens. */
export function ProductCard({ product, eager = false }: { product: ShopProduct; eager?: boolean }) {
  const onSale = product.salePrice !== null;

  return (
    <li className="h-full">
      <Link
        href={`/p/${product.slug}`}
        className="group flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface/80 p-3 transition duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-glow focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
      >
      <div className="relative aspect-square overflow-hidden rounded-xl bg-surface-2">
        {product.image && (
          <Image
            src={product.image.url}
            alt={product.image.alt}
            fill
            loading={eager ? "eager" : "lazy"}
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        )}
        {product.labels.length > 0 && (
          <div className="absolute top-2 left-2 flex flex-wrap gap-1">
            {product.labels.map((label) => (
              <Badge key={label.text} text={label.text} color={label.color} />
            ))}
          </div>
        )}
      </div>
      <p className="line-clamp-2 text-sm font-medium">{product.name}</p>
      <p className="mt-auto flex flex-wrap items-baseline gap-2 text-sm tabular-nums">
        {onSale ? (
          <>
            <span className="text-base font-bold">{formatPrice(product.salePrice!)}</span>
            <span className="text-muted line-through">{formatPrice(product.price)}</span>
            {discountPercent(product.price, product.salePrice!) >= 1 && (
              <span className="font-semibold text-primary">{discountPercent(product.price, product.salePrice!)}% off</span>
            )}
          </>
        ) : (
          <span className="text-base font-bold">{formatPrice(product.price)}</span>
        )}
      </p>
      {product.soldOut && <p className="text-sm text-danger">Sold out</p>}
      </Link>
    </li>
  );
}
