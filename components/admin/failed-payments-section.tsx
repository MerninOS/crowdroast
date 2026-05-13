"use client";

// Failed Payments section of the admin console (AC14).
//
// Lists commitment_bag_charges rows that have exhausted the charge worker's
// retry ladder (payment_status = 'payment_failed') and surfaces four manual
// remediation actions. Each action POSTs to /api/admin/failed-payments which
// is admin-gated server-side and writes a paired ops_actions audit row.
//
// Extracted from components/admin/admin-console.tsx (which is already 1,200+
// lines) so the section's own state and effects don't bloat that file. The
// parent only mounts <FailedPaymentsSection /> behind its activeSection enum.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@merninos/ui";
import { Badge } from "@merninos/ui";
import { Button } from "@merninos/ui";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type FailedPaymentActionKind =
  | "retry_charge"
  | "mark_covered_by_platform"
  | "mark_covered_by_hub"
  | "cancel_bag_portion";

export interface FailedPaymentRow {
  id: string;
  commitment_id: string;
  bag_number: number;
  kg: number;
  amount_cents: number;
  attempt_count: number;
  failed_reason: string | null;
  created_at: string;
  payment_status: string;
  buyer: {
    id: string;
    email: string | null;
    contact_name: string | null;
    company_name: string | null;
  } | null;
  lot: { id: string; title: string | null; seller_id: string } | null;
}

function formatMoneyFromCents(cents: number) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

function buyerLabel(row: FailedPaymentRow) {
  const b = row.buyer;
  if (!b) return "Unknown buyer";
  return b.contact_name || b.company_name || b.email || b.id.slice(0, 8);
}

const ACTION_LABELS: Record<FailedPaymentActionKind, string> = {
  retry_charge: "Retry manually",
  mark_covered_by_platform: "Cover (platform)",
  mark_covered_by_hub: "Cover (hub)",
  cancel_bag_portion: "Cancel bag portion",
};

// Per-action confirmation copy. Real-money decisions need a confirm step;
// these strings are shown via window.confirm before the POST fires.
const ACTION_CONFIRMATIONS: Record<FailedPaymentActionKind, (row: FailedPaymentRow) => string> = {
  retry_charge: (row) =>
    `Retry the charge for ${buyerLabel(row)} (${formatMoneyFromCents(row.amount_cents)})? The worker will pick it up on its next tick.`,
  mark_covered_by_platform: (row) =>
    `Mark this ${formatMoneyFromCents(row.amount_cents)} as covered by the PLATFORM? The bag will ship in full and the platform eats the cost.`,
  mark_covered_by_hub: (row) =>
    `Mark this ${formatMoneyFromCents(row.amount_cents)} as covered by the HUB? Make sure you've agreed this with the hub owner first.`,
  cancel_bag_portion: (row) =>
    `Cancel ${buyerLabel(row)}'s ${row.kg}kg portion of bag ${row.bag_number}? The bag ships short; no one covers the cost. Notes are required.`,
};

export function FailedPaymentsSection() {
  const [rows, setRows] = useState<FailedPaymentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  // Per-row free-form notes. Cancel actions require non-empty notes — others
  // are optional but recommended (and persisted to ops_actions.notes).
  const [notesDrafts, setNotesDrafts] = useState<Record<string, string>>({});

  const failedCount = useMemo(() => rows.length, [rows]);

  async function loadRows() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/failed-payments");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to load failed payments");
      }
      const data = (await res.json()) as FailedPaymentRow[];
      setRows(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went sideways");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadRows();
  }, []);

  async function performAction(row: FailedPaymentRow, action: FailedPaymentActionKind) {
    const notes = notesDrafts[row.id]?.trim() || "";

    if (action === "cancel_bag_portion" && !notes) {
      toast.error("Notes are required for a cancel action.");
      return;
    }

    if (!window.confirm(ACTION_CONFIRMATIONS[action](row))) {
      return;
    }

    setBusyRowId(row.id);
    try {
      const res = await fetch("/api/admin/failed-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          charge_id: row.id,
          action,
          notes: notes || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "Action failed");
      }
      // Optimistic local drop — the action either fixed the row (retry,
      // covers) or recorded a cancel. Either way it leaves the
      // payment_failed listing.
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setNotesDrafts((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      toast.success("Done. You're good.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went sideways");
    } finally {
      setBusyRowId(null);
    }
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Failed Payments</CardTitle>
        <CardDescription>
          Bag charges that exhausted all retry attempts. Pick a remediation per row.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Brewing...</p>
        ) : failedCount === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm font-medium text-foreground">No failed payments. Smooth sailing.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              When a charge gives up after 3 attempts, it'll land here for your call.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Buyer</TableHead>
                <TableHead>Lot</TableHead>
                <TableHead>Bag</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead className="w-[360px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const isBusy = busyRowId === row.id;
                const draft = notesDrafts[row.id] || "";
                return (
                  <TableRow key={row.id} data-row-id={row.id}>
                    <TableCell>
                      <p className="font-medium text-foreground">{buyerLabel(row)}</p>
                      {row.buyer?.email && (
                        <p className="text-xs text-muted-foreground">{row.buyer.email}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-foreground">
                        {row.lot?.title || "Unknown lot"}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p>
                        #{row.bag_number} · {row.kg}kg
                      </p>
                    </TableCell>
                    <TableCell>{formatMoneyFromCents(row.amount_cents)}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Badge variant="secondary">{row.attempt_count} attempts</Badge>
                        {row.failed_reason && (
                          <p className="text-xs text-muted-foreground" title={row.failed_reason}>
                            {row.failed_reason}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-2">
                        <Textarea
                          value={draft}
                          onChange={(e) =>
                            setNotesDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))
                          }
                          placeholder="Notes (required for cancel)"
                          rows={2}
                          aria-label={`Notes for ${buyerLabel(row)}`}
                          className="text-xs"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isBusy}
                            onClick={() => performAction(row, "retry_charge")}
                          >
                            {ACTION_LABELS.retry_charge}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isBusy}
                            onClick={() => performAction(row, "mark_covered_by_platform")}
                          >
                            {ACTION_LABELS.mark_covered_by_platform}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isBusy}
                            onClick={() => performAction(row, "mark_covered_by_hub")}
                          >
                            {ACTION_LABELS.mark_covered_by_hub}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isBusy}
                            onClick={() => performAction(row, "cancel_bag_portion")}
                          >
                            {ACTION_LABELS.cancel_bag_portion}
                          </Button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
