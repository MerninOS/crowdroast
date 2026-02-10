import { redirect } from "next/navigation";

export default function MarketplacePage() {
  // The marketplace is now hub-scoped. Buyers browse through their dashboard.
  redirect("/dashboard");
}
