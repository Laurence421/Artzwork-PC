import { redirect } from "next/navigation";

// My orders moved to /orders (next to Cart in the nav bar); My account opens on Profile.
export default function AccountPage() {
  redirect("/account/profile");
}
