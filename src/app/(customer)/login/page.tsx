import type { Metadata } from "next";
import { LoginScreen } from "@/features/shared/auth/auth-screens";
import { AuthLink } from "@/features/shared/ui/auth-shell";

export const metadata: Metadata = { title: "Log in · Artzwork PC" };

export default function CustomerLoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <LoginScreen
      title="Log in"
      subtitle="Welcome back."
      footer={<>New here? <AuthLink href="/signup">Create an account</AuthLink></>}
      searchParams={searchParams}
      withGoogle
    />
  );
}
