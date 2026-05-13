// Tiny insert helper for the ops_actions audit log (migration #39).
//
// One write happens for every manual remediation action ops takes against a
// commitment_bag_charges row. The table is append-only (no UPDATE/DELETE
// policies). All admin writes go through the service-role admin client.

import type { SupabaseClient } from "@supabase/supabase-js";

export type OpsActionKind =
  | "retry_charge"
  | "mark_covered_by_platform"
  | "mark_covered_by_hub"
  | "cancel_bag_portion";

export type OpsActionTargetType = "commitment_bag_charge";

export interface RecordOpsActionInput {
  performedBy: string; // profiles.id of the admin user
  actionKind: OpsActionKind;
  targetId: string;
  targetType: OpsActionTargetType;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordOpsAction(
  admin: SupabaseClient,
  input: RecordOpsActionInput
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await admin
    .from("ops_actions")
    .insert({
      performed_by: input.performedBy,
      action_kind: input.actionKind,
      target_id: input.targetId,
      target_type: input.targetType,
      notes: input.notes ?? null,
      metadata: input.metadata ?? {},
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }
  return { id: data.id as string };
}
