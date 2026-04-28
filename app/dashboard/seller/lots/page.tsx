import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@merninos/ui";
import { Badge } from "@merninos/ui";
import { Button } from "@merninos/ui";
import { Progress } from "@/components/ui/progress";
import { Plus, Pencil, Package } from "lucide-react";
import Link from "next/link";
import type { Lot } from "@/lib/types";
import { UnitPriceText, UnitWeightText } from "@/components/unit-value";
import { SellerLotCsvUploadModal } from "@/components/seller-lot-csv-upload-modal";
import { SellerLotStatusToggle } from "@/components/seller-lot-status-toggle";
import {
  SellerAwaitingRelistCard,
  type RelistOutcome,
} from "@/components/seller-awaiting-relist-card";

const statusStyles: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  fully_committed: "bg-blue-50 text-blue-700 border-blue-200",
  draft: "bg-secondary text-secondary-foreground",
  awaiting_relist: "bg-amber-50 text-amber-700 border-amber-200",
};

type CampaignRow = {
  id: string;
  lot_id: string;
  hub_id: string;
  status: string;
  deadline: string | null;
  settled_at: string | null;
  created_at: string;
};

type ReviewCard = {
  lotId: string;
  lotTitle: string;
  expiryDate: string | null;
  outcome: RelistOutcome;
  campaign: {
    hubName: string | null;
    deadline: string | null;
    committedKg: number;
    buyerCount: number;
  } | null;
};

function pickMostRecentTerminalCampaign(
  rows: CampaignRow[]
): CampaignRow | null {
  const terminal = rows.filter((r) =>
    ["settled", "failed", "cancelled"].includes(r.status)
  );
  if (terminal.length === 0) return null;
  // Sort by settled_at (when present) then created_at, both descending.
  return terminal.sort((a, b) => {
    const aTime = new Date(a.settled_at || a.created_at).getTime();
    const bTime = new Date(b.settled_at || b.created_at).getTime();
    return bTime - aTime;
  })[0];
}

function statusToOutcome(status: string): RelistOutcome {
  if (status === "settled") return "settled";
  if (status === "failed") return "failed";
  if (status === "cancelled") return "cancelled";
  return "expired";
}

export default async function SellerLotsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: lots } = await supabase
    .from("lots")
    .select("*")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false });

  const allLots = (lots as Lot[]) || [];
  const awaitingRelistLots = allLots.filter((l) => l.status === "awaiting_relist");
  const myLots = allLots.filter((l) => l.status !== "awaiting_relist");

  // Pull all campaigns for the awaiting_relist lots in one round-trip.
  // For each lot we surface the most-recent terminal campaign (if any).
  let reviewCards: ReviewCard[] = [];
  if (awaitingRelistLots.length > 0) {
    const lotIds = awaitingRelistLots.map((l) => l.id);

    const { data: campaignRows } = await supabase
      .from("campaigns")
      .select("id, lot_id, hub_id, status, deadline, settled_at, created_at, hub:hubs(name)")
      .in("lot_id", lotIds);

    // Supabase returns related records as an array even on a 1:1 join.
    type CampaignWithHubRaw = CampaignRow & {
      hub: { name: string }[] | { name: string } | null;
    };
    const byLot = new Map<string, CampaignWithHubRaw[]>();
    for (const row of (campaignRows as unknown as CampaignWithHubRaw[]) || []) {
      const list = byLot.get(row.lot_id) ?? [];
      list.push(row);
      byLot.set(row.lot_id, list);
    }

    // Aggregate commitment counts and committed kg for each terminal campaign in one pass.
    const terminalCampaignIds = Array.from(byLot.values())
      .map((rows) => pickMostRecentTerminalCampaign(rows)?.id)
      .filter((id): id is string => Boolean(id));

    let summaryByCampaignId = new Map<string, { committedKg: number; buyerCount: number }>();
    if (terminalCampaignIds.length > 0) {
      const { data: commitmentRows } = await supabase
        .from("commitments")
        .select("campaign_id, buyer_id, quantity_kg")
        .in("campaign_id", terminalCampaignIds);

      for (const row of (commitmentRows as { campaign_id: string; buyer_id: string; quantity_kg: number }[]) || []) {
        const existing = summaryByCampaignId.get(row.campaign_id) ?? {
          committedKg: 0,
          buyerCount: 0,
        };
        existing.committedKg += Number(row.quantity_kg) || 0;
        existing.buyerCount += 1;
        summaryByCampaignId.set(row.campaign_id, existing);
      }
    }

    reviewCards = awaitingRelistLots.map((lot) => {
      const rows = byLot.get(lot.id) ?? [];
      const terminal = pickMostRecentTerminalCampaign(rows);
      const summary = terminal ? summaryByCampaignId.get(terminal.id) : undefined;
      const hubField = terminal ? (terminal as CampaignWithHubRaw).hub : null;
      const hubName = Array.isArray(hubField)
        ? hubField[0]?.name ?? null
        : hubField?.name ?? null;
      return {
        lotId: lot.id,
        lotTitle: lot.title,
        expiryDate: lot.expiry_date,
        outcome: terminal ? statusToOutcome(terminal.status) : "expired",
        campaign: terminal
          ? {
              hubName,
              deadline: terminal.deadline,
              committedKg: summary?.committedKg ?? 0,
              buyerCount: summary?.buyerCount ?? 0,
            }
          : null,
      };
    });
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">My Lots</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your coffee lot listings.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <SellerLotCsvUploadModal />
          <Button asChild className="w-full sm:w-auto shadow-sm">
            <Link href="/dashboard/seller/lots/new">
              <Plus className="mr-2 h-4 w-4" />
              Create Lot
            </Link>
          </Button>
        </div>
      </div>

      {reviewCards.length > 0 && (
        <section id="needs-review" className="mb-10">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-foreground">Needs Review</h2>
            <span className="text-xs text-muted-foreground">
              {reviewCards.length} lot{reviewCards.length !== 1 ? "s" : ""} to decide on
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {reviewCards.map((card) => (
              <SellerAwaitingRelistCard key={card.lotId} {...card} />
            ))}
          </div>
        </section>
      )}

      {myLots.length === 0 && reviewCards.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center py-10 px-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-muted-foreground mb-4">
              <Package className="h-6 w-6" />
            </div>
            <p className="text-sm text-muted-foreground">
              You haven&apos;t created any lots yet.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <SellerLotCsvUploadModal />
              <Button asChild size="sm">
                <Link href="/dashboard/seller/lots/new">Create Your First Lot</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : myLots.length === 0 ? null : (
        <div className="space-y-3">
          {myLots.map((lot) => {
            const pct =
              lot.total_quantity_kg > 0
                ? Math.round((lot.committed_quantity_kg / lot.total_quantity_kg) * 100)
                : 0;
            const statusLabel = lot.status === "fully_committed"
              ? "Fully Committed"
              : lot.status.charAt(0).toUpperCase() + lot.status.slice(1);

            return (
              <Card key={lot.id} className="shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/dashboard/seller/lots/${lot.id}/edit`}
                        className="text-sm font-semibold text-foreground hover:text-primary transition-colors"
                      >
                        {lot.title}
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {lot.origin_country}
                        {lot.region ? `, ${lot.region}` : ""} &middot;{" "}
                        <UnitPriceText
                          pricePerKg={lot.price_per_kg}
                          currency={lot.currency || "USD"}
                        />
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className={`text-xs ${statusStyles[lot.status] || ""}`}>
                        {statusLabel}
                      </Badge>
                      {(lot.status === "active" || lot.status === "draft") && (
                        <SellerLotStatusToggle
                          lotId={lot.id}
                          currentStatus={lot.status}
                          hasContributors={Number(lot.committed_quantity_kg || 0) > 0}
                        />
                      )}
                      <Button asChild size="sm" variant="outline" className="hidden sm:flex bg-transparent">
                        <Link href={`/dashboard/seller/lots/${lot.id}/edit`}>
                          <Pencil className="mr-1 h-3 w-3" />
                          Edit
                        </Link>
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground">
                        <UnitWeightText kg={lot.committed_quantity_kg} /> /{" "}
                        <UnitWeightText kg={lot.total_quantity_kg} />
                      </span>
                      <span className="font-medium text-foreground">{pct}%</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
