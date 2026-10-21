import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingText } from "@/features/seller/components/loading-panel";
import { PageHeader, Panel } from "@/features/seller/components/seller-shell";
import { AccountSettings, OrderSettings, PaymentSettings, PaymentSmsSettings, ShippingSettings } from "@/features/seller/components/settings-forms";
import { getRecentPaymentSms, getSettings } from "@/features/seller/queries/settings";
import { smsWebhookUrl } from "@/features/shared/lib/payment-sms-match";
import { paymentProvider } from "@/features/shared/lib/payments";
import { getSellerStore } from "@/features/seller/queries/store";

export const metadata: Metadata = { title: "Settings · Artzwork PC" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Payment, delivery and your account. Checkout uses these straight away." />
      <Suspense fallback={<LoadingText />}>
        <SettingsContent />
      </Suspense>
    </>
  );
}

async function SettingsContent() {
  const [{ store }, settings, recentSms] = await Promise.all([getSellerStore(), getSettings(), getRecentPaymentSms()]);

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="flex flex-col gap-6">
        <Panel title="Payment methods">
          <PaymentSettings storeId={store.id} payments={settings.payments} provider={paymentProvider()} />
        </Panel>
        <Panel title="Automatic payment check">
          <PaymentSmsSettings url={smsWebhookUrl()} recent={recentSms} />
        </Panel>
        <Panel title="Delivery options">
          <ShippingSettings options={settings.shipping} />
        </Panel>
      </div>
      <div className="flex flex-col gap-6">
        <Panel title="Orders">
          <OrderSettings ttlDays={settings.pendingOrderTtlDays} />
        </Panel>
        <Panel title="Account">
          <AccountSettings email={settings.sellerEmail} />
        </Panel>
      </div>
    </div>
  );
}
