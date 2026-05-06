import type { SupabaseClient } from "@supabase/supabase-js";

// Called per-commitment in the success branch of settle-deadlines, AFTER the
// existing refund-the-diff math has produced split.platformAmount (Mernin's
// share on this commit) but BEFORE the platform transfer fans out.
//
// Reads the buyer's current credit balance and applies
//   applied = min(balance, platformAmountCents)
// as a single negative credit_ledger row. The partial unique index
// idx_credit_ledger_commit_applied_unique on (source_commitment_id) WHERE
// reason='commit_applied' makes the insert idempotent across cron retries:
// on a 23505 collision we read back the prior debit and treat that as the
// already-applied figure for this commitment, keeping the math consistent.
//
// Returns:
//   applied                   — cents debited (always >= 0; 0 means no-op)
//   adjustedPlatformAmount    — split.platformAmount reduced by applied
//   ledger_row_inserted       — true if this call wrote the row, false if it
//                               read back a prior row or short-circuited
//
// Mernin's-share floor: $0. The min() clamps applied to platformAmountCents,
// so the adjusted platform amount is always >= 0.
export async function applyInviterCreditOnSettle(
  admin: SupabaseClient,
  args: {
    commitmentId: string;
    buyerId: string;
    platformAmountCents: number;
  }
): Promise<{
  applied: number;
  adjustedPlatformAmountCents: number;
  ledgerRowInserted: boolean;
}> {
  const { commitmentId, buyerId, platformAmountCents } = args;

  if (!commitmentId || !buyerId || platformAmountCents <= 0) {
    return {
      applied: 0,
      adjustedPlatformAmountCents: Math.max(0, platformAmountCents),
      ledgerRowInserted: false,
    };
  }

  // Read current balance via the SQL function added in migration 30.
  const { data: balanceData } = await admin.rpc("credit_balance_cents", {
    p_user_id: buyerId,
  });

  const balance =
    typeof balanceData === "number"
      ? balanceData
      : Number((balanceData as unknown as number) ?? 0);

  if (!balance || balance <= 0) {
    return {
      applied: 0,
      adjustedPlatformAmountCents: platformAmountCents,
      ledgerRowInserted: false,
    };
  }

  const applied = Math.min(balance, platformAmountCents);

  if (applied <= 0) {
    return {
      applied: 0,
      adjustedPlatformAmountCents: platformAmountCents,
      ledgerRowInserted: false,
    };
  }

  // Insert the debit. Partial unique index handles cron-retry idempotency.
  const { error: insertError } = await admin.from("credit_ledger").insert({
    user_id: buyerId,
    amount_cents: -applied,
    reason: "commit_applied",
    source_commitment_id: commitmentId,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      // Race or retry — a prior pass already inserted the debit for this
      // commitment. Read back its amount so we report consistent math.
      const { data: existing } = await admin
        .from("credit_ledger")
        .select("amount_cents")
        .eq("source_commitment_id", commitmentId)
        .eq("reason", "commit_applied")
        .maybeSingle();

      const priorApplied =
        existing && typeof existing.amount_cents === "number"
          ? Math.abs(existing.amount_cents)
          : 0;

      return {
        applied: priorApplied,
        adjustedPlatformAmountCents: Math.max(0, platformAmountCents - priorApplied),
        ledgerRowInserted: false,
      };
    }
    // Any other error: don't apply, don't reduce platform share. Better to
    // overpay Mernin than to lose track of the buyer's balance.
    return {
      applied: 0,
      adjustedPlatformAmountCents: platformAmountCents,
      ledgerRowInserted: false,
    };
  }

  return {
    applied,
    adjustedPlatformAmountCents: platformAmountCents - applied,
    ledgerRowInserted: true,
  };
}
