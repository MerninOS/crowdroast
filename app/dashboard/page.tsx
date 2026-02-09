import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role || user.user_metadata?.role || "buyer";

  switch (role) {
    case "seller":
      redirect("/dashboard/seller");
    case "hub_owner":
      redirect("/dashboard/hub");
    default:
      redirect("/dashboard/buyer");
  }
}
