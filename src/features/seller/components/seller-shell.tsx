import Link from "next/link";
import { BackGuard } from "./back-guard";
import { SellerLogoMark } from "./seller-logo";
import { MobileMenu, SellerNav } from "./seller-nav";

/** Frame for every signed-in seller page: sidebar on desktop, top bar with a menu on phones. */
export function SellerShell({
  storeName,
  pendingOrders,
  children,
}: {
  storeName: string;
  pendingOrders?: number;
  children: React.ReactNode;
}) {
  const shopUrl = process.env.SHOP_URL;

  return (
    <div className="flex min-h-full flex-1">
      <BackGuard />
      <aside className="sticky top-0 hidden h-dvh w-64 print:hidden shrink-0 flex-col gap-8 border-r border-border bg-surface/80 p-4 backdrop-blur-md lg:flex">
        <Link href="/" className="flex items-center gap-2 px-3 pt-2 font-display text-lg font-bold tracking-tight uppercase">
          <SellerLogoMark />
          <span className="truncate">{storeName}</span>
        </Link>
        <SellerNav shopUrl={shopUrl} pendingOrders={pendingOrders} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 print:hidden items-center justify-between gap-4 border-b border-border bg-surface/80 px-4 backdrop-blur-md lg:hidden">
          <Link href="/" className="flex min-w-0 items-center gap-2 text-base font-semibold">
            <SellerLogoMark />
            <span className="truncate">{storeName}</span>
          </Link>
          <MobileMenu shopUrl={shopUrl} pendingOrders={pendingOrders} />
        </header>
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8">{children}</main>
      </div>
    </div>
  );
}

/** Page title with an optional line under it and actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Bordered surface that groups part of a page, with its own heading. */
export function Panel({ title, children, action }: { title?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
      {(title || action) && (
        <div className="flex items-center justify-between gap-4">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
