import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/credits/me — caller's credit balance plus ledger history.
//
// Balance is the running SUM of amount_cents in credit_ledger for this user.
// We also return the ledger rows themselves (newest first) so the dashboard
// disclosure can render history without a second round-trip. RLS limits the
// rows to the caller's own user_id.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("credit_ledger")
    .select(
      "id, amount_cents, reason, source_attribution_id, source_commitment_id, granted_by_admin_id, note, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type Row = {
    id: string;
    amount_cents: number;
    reason: "referral_earned" | "commit_applied" | "admin_adjust";
    source_attribution_id: string | null;
    source_commitment_id: string | null;
    granted_by_admin_id: string | null;
    note: string | null;
    created_at: string;
  };

  const rows = (data ?? []) as Row[];
  const balance_cents = rows.reduce((sum, r) => sum + r.amount_cents, 0);

  return NextResponse.json({ balance_cents, ledger: rows });
}
