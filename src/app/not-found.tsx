import { AuthLink, AuthShell } from "@/features/shared/ui/auth-shell";

// Any address that matches no page, on either site. Missing shop products and orders
// use the shop's own not-found page (with the nav bar) instead.
export default function NotFound() {
  return (
    <AuthShell title="Page not found" subtitle="This page doesn't exist, or it has moved." footer={<AuthLink href="/">Go to the home page</AuthLink>} />
  );
}
