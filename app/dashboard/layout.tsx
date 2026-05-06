import React from "react"
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { isAdminAccount } from "@/lib/auth/admin";
import { SignupNotifyTrigger } from "@/components/referrals/SignupNotifyTrigger";

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
    profile?.role ||
    (user.user_metadata?.role as "buyer" | "seller" | "hub_owner" | "admin" | undefined) ||
    "buyer";
  const role = isAdminAccount({ email: user.email, role: baseRole }) ? "admin" : baseRole;

  // Buyer-referral: best-effort notify of inviter when an attributed user
  // first lands on the dashboard. Idempotent server-side via the timestamp
  // stamp on profiles. Skipped for users with no inviter (component itself
  // also short-circuits for them server-side).
  const shouldFireNotify =
    profile?.invited_by_user_id && !profile?.referral_signup_email_sent_at;

  return (
    <DashboardShell
      user={user}
      profile={profile}
      role={role}
    >
      {shouldFireNotify && <SignupNotifyTrigger />}
      {children}
    </DashboardShell>
  );
}
