import { Suspense } from "react";
import { AccountTabs } from "@/features/customer/components/account-shell";
import { getCustomerEmail } from "@/features/customer/queries/account";

// My account: signed-in customers only. Each page sends signed-out visitors to the login with
// its own address, so they come back to the page they asked for.
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <WithCustomer>{children}</WithCustomer>
      </Suspense>
    </main>
  );
}

async function WithCustomer({ children }: { children: React.ReactNode }) {
  const email = await getCustomerEmail();
  return (
    <>
      {email !== null && <AccountTabs email={email} />}
      {children}
    </>
  );
}
