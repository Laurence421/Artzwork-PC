import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LoadingText } from "@/features/seller/components/loading-panel";
import { PageHeader, Panel } from "@/features/seller/components/seller-shell";
import { CUSTOMER_LIST_LIMIT, listCustomers } from "@/features/seller/queries/customers";
import { formatPrice } from "@/features/shared/lib/money";
import { focusRingClasses } from "@/features/shared/ui/button-styles";

export const metadata: Metadata = { title: "Customers · Artzwork PC" };

const day = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });

export default function CustomersPage({ searchParams }: PageProps<"/seller/customers">) {
  return (
    <>
      <PageHeader title="Customers" description="Everyone who has ordered. Spent counts paid, shipped and completed orders." />
      <Suspense fallback={<LoadingText />}>
        <CustomersContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function CustomersContent({ searchParams }: { searchParams: PageProps<"/seller/customers">["searchParams"] }) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const { customers, more } = await listCustomers({ q });

  return (
    <>
      <form role="search" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Name, email or phone"
          aria-label="Search customers"
          className="h-9 w-56 rounded-lg border border-border bg-surface px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary"
        />
      </form>

      {more && (
        <p className="text-sm text-muted">
          Showing the {CUSTOMER_LIST_LIMIT.toLocaleString("en-PH")} newest customers. Use search to find others.
        </p>
      )}

      {customers.length === 0 ? (
        q ? (
          <p className="text-sm text-muted">No customers match.</p>
        ) : (
          <Panel>
            <p className="text-sm text-muted">No customers yet. They&apos;ll show here after their first order.</p>
          </Panel>
        )
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-surface md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 text-right font-medium">Orders</th>
                  <th className="px-4 py-3 text-right font-medium">Spent</th>
                  <th className="px-4 py-3 font-medium">Last order</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <span className="flex flex-col">
                        <Link href={`/customers/${c.id}`} className={`font-medium hover:underline ${focusRingClasses}`}>
                          {c.name}
                        </Link>
                        <span className="text-xs text-muted">{c.email}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{c.phone}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.orderCount}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatPrice(c.spent)}</td>
                    <td className="px-4 py-3 text-muted">{c.lastOrderAt ? day.format(new Date(c.lastOrderAt)) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone cards */}
          <ul className="flex flex-col gap-2 md:hidden">
            {customers.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/customers/${c.id}`}
                  className={`flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-3 text-sm ${focusRingClasses}`}
                >
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="truncate font-medium">{c.name}</span>
                    <span className="truncate text-muted">{c.email}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-semibold tabular-nums">{formatPrice(c.spent)}</span>
                    <span className="text-muted tabular-nums">
                      {c.orderCount} {c.orderCount === 1 ? "order" : "orders"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
