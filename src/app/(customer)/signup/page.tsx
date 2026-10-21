import type { Metadata } from "next";
import { SignupScreen } from "@/features/shared/auth/auth-screens";
import { AuthLink } from "@/features/shared/ui/auth-shell";

export const metadata: Metadata = { title: "Create your account · Artzwork PC" };

export default function CustomerSignupPage({ searchParams }: PageProps<"/signup">) {
  return (
    <SignupScreen
      title="Create your account"
      subtitle="Track your orders and check out faster."
      footer={<>Already have an account? <AuthLink href="/login">Log in</AuthLink></>}
      searchParams={searchParams}
      withGoogle
    />
  );
}
