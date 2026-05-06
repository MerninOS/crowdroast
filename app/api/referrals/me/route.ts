import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/referrals/me — inviter-facing list of attributions, grouped by
// status. RLS on referral_attributions only lets the inviter read rows where
// inviter_user_id = auth.uid(), so the cookie-bound client returns exactly
// the right scope without an extra filter here.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("referral_attributions")
    .select(
      `
      id, status, earned_at, created_at,
      invitee:profiles!referral_attributions_invitee_user_id_fkey(contact_name, company_name)
      `
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type Row = {
    id: string;
    status: "pending" | "earned" | "voided";
    earned_at: string | null;
    created_at: string;
    invitee: { contact_name: string | null; company_name: string | null } | null;
  };

  const rows = (data ?? []) as unknown as Row[];

  return NextResponse.json({
    pending: rows.filter((r) => r.status === "pending"),
    earned: rows.filter((r) => r.status === "earned"),
    voided: rows.filter((r) => r.status === "voided"),
  });
}
