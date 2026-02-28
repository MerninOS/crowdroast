import { redirect } from "next/navigation";

export default async function AdminDashboardPage() {
  redirect("/dashboard/admin/roles");
}
