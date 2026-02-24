import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/auth/admin";
import { AdminConsole } from "@/components/admin/admin-console";

export default async function AdminRequestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");
  if (!isAdminEmail(user.email)) redirect("/dashboard");

  return <AdminConsole initialSection="requests" />;
}
