import Link from "next/link";

/** Page frame for login, sign-up and onboarding: brand, then one card with the page's only heading. */
export function AuthShell({
  title,
  subtitle,
  footer,
  brand,
  children,
}: {
  title: string;
  /** Replaces the text brand above the card, e.g. the seller site's logo. */
  brand?: React.ReactNode;
  subtitle?: string;
  footer?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-6">
        {brand ?? (
          <Link href="/" className="text-sm font-semibold">
            Artzwork PC
          </Link>
        )}
        <section className="flex animate-fade-up flex-col gap-6 rounded-2xl border border-border bg-surface/90 p-6 shadow-glow backdrop-blur-md sm:p-8">
          <header className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
          </header>
          {children}
          {footer && <p className="text-sm text-muted">{footer}</p>}
        </section>
      </div>
    </main>
  );
}

/** Inline link used in AuthShell footers. */
export function AuthLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-primary hover:underline">
      {children}
    </Link>
  );
}
