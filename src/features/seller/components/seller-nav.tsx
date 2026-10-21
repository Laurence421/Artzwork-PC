"use client";

import { ExternalLink, LayoutDashboard, LogOut, Package, Palette, Settings, ShoppingBag, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { useEffect, useRef } from "react";
import { logout } from "@/features/shared/auth/actions";
import { focusRingClasses } from "@/features/shared/ui/button-styles";
import { ConfirmButton } from "@/features/shared/ui/confirm-button";

// segment = the route folder under the seller app layout (null = dashboard).
const ITEMS: { label: string; href: string; segment: string | null; ready: boolean; icon: LucideIcon }[] = [
  { label: "Dashboard", href: "/", segment: null, ready: true, icon: LayoutDashboard },
  { label: "Products", href: "/products", segment: "products", ready: true, icon: Package },
  { label: "Orders", href: "/orders", segment: "orders", ready: true, icon: ShoppingBag },
  { label: "Customers", href: "/customers", segment: "customers", ready: true, icon: Users },
  { label: "Branding", href: "/branding", segment: "branding", ready: true, icon: Palette },
  { label: "Settings", href: "/settings", segment: "settings", ready: true, icon: Settings },
];

const itemClass = `flex h-10 items-center justify-between gap-2 rounded-xl px-3 text-sm transition-colors duration-200 ${focusRingClasses}`;
// The current page: a soft accent tint with an accent bar on its left.
const currentClass = "aria-[current=page]:bg-primary/15 aria-[current=page]:font-semibold aria-[current=page]:text-foreground aria-[current=page]:shadow-[inset_3px_0_0_var(--primary)]";

function LogoutButton() {
  return (
    <ConfirmButton
      title="Log out?"
      confirmLabel="Log out"
      pendingLabel="Logging out…"
      className={`${itemClass} w-full cursor-pointer text-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-60`}
    >
      <span className="flex items-center gap-3">
        <LogOut aria-hidden className="size-4 shrink-0" />
        Log out
      </span>
    </ConfirmButton>
  );
}

/** Menu links. The route segment (not the URL) decides the current page, so the seller-site rewrite can't confuse it. */
export function SellerNav({ shopUrl, pendingOrders = 0 }: { shopUrl?: string; pendingOrders?: number }) {
  const segment = useSelectedLayoutSegment();

  return (
    <nav aria-label="Seller menu" className="flex flex-1 flex-col gap-6">
      <ul className="flex flex-col gap-1">
        {ITEMS.map((item) => (
          <li key={item.label}>
            {item.ready ? (
              <Link
                href={item.href}
                aria-current={segment === item.segment ? "page" : undefined}
                className={`${itemClass} text-muted hover:bg-surface-2 hover:text-foreground ${currentClass}`}
              >
                <span className="flex items-center gap-3">
                  <item.icon aria-hidden className="size-4 shrink-0" />
                  {item.label}
                </span>
                {item.segment === "orders" && pendingOrders > 0 && (
                  <span className="min-w-5 rounded-full bg-primary px-1.5 text-center text-xs font-semibold text-primary-foreground tabular-nums">
                    {pendingOrders}
                    <span className="sr-only"> pending</span>
                  </span>
                )}
              </Link>
            ) : (
              <span className={`${itemClass} text-muted`}>
                {item.label}
                <span className="text-xs">Soon</span>
              </span>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-auto flex flex-col gap-1 border-t border-border pt-4">
        {shopUrl && (
          <a href={shopUrl} className={`${itemClass} text-muted hover:bg-surface-2 hover:text-foreground`}>
            <span className="flex items-center gap-3">
              <ExternalLink aria-hidden className="size-4 shrink-0" />
              View shop
            </span>
          </a>
        )}
        <form action={logout}>
          <LogoutButton />
        </form>
      </div>
    </nav>
  );
}

/** Phone menu: a disclosure that closes itself after navigating. */
export function MobileMenu({ shopUrl, pendingOrders }: { shopUrl?: string; pendingOrders?: number }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const segment = useSelectedLayoutSegment();
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [segment]);

  return (
    <details ref={ref} className="group">
      <summary className={`flex h-9 cursor-pointer list-none items-center rounded-lg border border-border px-3 text-sm font-medium [&::-webkit-details-marker]:hidden ${focusRingClasses}`}>
        Menu
      </summary>
      <div className="absolute inset-x-0 top-14 z-10 border-b border-border bg-surface p-4">
        <SellerNav shopUrl={shopUrl} pendingOrders={pendingOrders} />
      </div>
    </details>
  );
}
