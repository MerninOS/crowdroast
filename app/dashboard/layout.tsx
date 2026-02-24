import React from "react"
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { isAdminEmail } from "@/lib/auth/admin";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    redirect("/auth/login");
  }

  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const baseRole =
    profile?.role || (user.user_metadata?.role as "buyer" | "seller" | "hub_owner" | undefined) || "buyer";
  const role = isAdminEmail(user.email) ? "admin" : baseRole;

  return (
    <DashboardShell
      user={user}
      profile={profile}
      role={role}
    >
      {children}
    </DashboardShell>
  );
}
