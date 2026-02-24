import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/auth/admin";

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");
  if (!isAdminEmail(user.email)) redirect("/dashboard");

  redirect("/dashboard/admin/roles");
}
