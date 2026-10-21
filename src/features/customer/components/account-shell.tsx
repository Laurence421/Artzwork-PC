"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/features/shared/auth/actions";
import { buttonClasses, focusRingClasses } from "@/features/shared/ui/button-styles";
import { ConfirmButton } from "@/features/shared/ui/confirm-button";

const TABS = [
  { href: "/account/profile", label: "Profile" },
  { href: "/account/addresses", label: "Addresses" },
];

/** Tabs across the account pages, with Log out on the right. */
export function AccountTabs({ email }: { email: string }) {
  const pathname = usePathname();
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">My account</h1>
          <p className="text-sm text-muted">{email}</p>
        </div>
        <form action={logout}>
          <ConfirmButton title="Log out?" confirmLabel="Log out" pendingLabel="Logging out…" className={buttonClasses("sm")}>
            Log out
          </ConfirmButton>
        </form>
      </header>
      <nav aria-label="Account" className="flex flex-wrap gap-1 border-b border-border pb-2">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={pathname === t.href ? "page" : undefined}
            className={`flex h-9 items-center rounded-lg px-3 text-sm hover:bg-surface aria-[current=page]:bg-surface aria-[current=page]:font-medium ${focusRingClasses}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
