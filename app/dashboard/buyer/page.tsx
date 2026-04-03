import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/mernin/Card";
import { Badge } from "@/components/mernin/Badge";
import { Progress } from "@/components/ui/progress";
import { Clock, Coffee, Target, TrendingDown, Warehouse, Search } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/mernin/Button";
import { UnitPriceText, UnitWeightText } from "@/components/unit-value";
import { LeaveHubButton } from "@/components/leave-hub-button";

function getHubName(memberships: any[], hubId: string) {
  const membership = memberships.find((m: any) => m.hub_id === hubId);
  const hubRel = membership?.hub;
  return Array.isArray(hubRel)
    ? (hubRel[0] as any)?.name || "Hub"
    : (hubRel as any)?.name || "Hub";
}

function formatTimeLeft(deadline: string | null) {
  if (!deadline) return "No deadline";

  const now = Date.now();
  const end = new Date(deadline).getTime();
  const diffMs = end - now;
  if (diffMs <= 0) return "Ended";

  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

export default async function BuyerOverview({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }> | { tab?: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const resolvedSearchParams = searchParams ? await Promise.resolve(searchParams) : {};
  const activeTab = resolvedSearchParams?.tab === "past" ? "past" : "active";

  const { data: memberships } = await supabase
    .from("hub_members")
    .select("hub_id, hub:hubs!hub_members_hub_id_fkey(name)")
    .eq("user_id", user.id)
    .eq("status", "active");

  const hubIds = (memberships || []).map((m: any) => m.hub_id);

  if (hubIds.length === 0) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Buyer Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Active lots from your hubs will appear here.
          </p>
        </div>

        <Card className="border-dashed shadow-sm">
          <CardContent className="flex flex-col items-center px-4 py-10">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
              <Warehouse className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-foreground">No Hub Membership Yet</h3>
            <p className="mt-2 max-w-sm text-center text-sm leading-relaxed text-muted-foreground">
              Join a hub to browse and commit to coffee lots. Find one near you or request access directly.
            </p>
            <Button asChild className="mt-4">
              <Link href="/dashboard/find-hub">
                <Search className="mr-2 h-4 w-4" />
                Find a Hub
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { data: hubLots } = await supabase
    .from("hub_lots")
    .select(
      "hub_id, lot_id, lot:lots!hub_lots_lot_id_fkey(*, seller:profiles!lots_seller_id_fkey(company_name, contact_name))"
    )
    .in("hub_id", hubIds);

  const allLots = (hubLots || []).filter((hl: any) => Boolean(hl?.lot));
  const allLotIds = allLots.map((hl: any) => hl.lot_id).filter(Boolean);

  let commitments: any[] = [];
  if (allLotIds.length > 0) {
    const { data } = await supabase
      .from("commitments")
      .select("lot_id, status")
      .eq("buyer_id", user.id)
      .in("lot_id", allLotIds);
    commitments = data || [];
  }

  const investedLotIds = new Set(
    commitments
      .filter((c: any) => c.status !== "cancelled")
      .map((c: any) => c.lot_id)
  );

  let tiersMap: Record<string, any[]> = {};
  if (allLotIds.length > 0) {
    const { data: allTiers } = await supabase
      .from("pricing_tiers")
      .select("lot_id, min_quantity_kg, price_per_kg")
      .in("lot_id", allLotIds)
      .order("min_quantity_kg", { ascending: true });

    for (const tier of allTiers || []) {
      if (!tiersMap[tier.lot_id]) tiersMap[tier.lot_id] = [];
      tiersMap[tier.lot_id].push(tier);
    }
  }

  const nowMs = Date.now();
  const activeSource = allLots.filter((hl: any) => {
    const deadlineMs = hl.lot.commitment_deadline
      ? new Date(hl.lot.commitment_deadline).getTime()
      : null;
    const isPast = deadlineMs !== null && deadlineMs <= nowMs;
    return hl.lot.status === "active" && !isPast;
  });

  const pastSource = allLots.filter((hl: any) => {
    const deadlineMs = hl.lot.commitment_deadline
      ? new Date(hl.lot.commitment_deadline).getTime()
      : null;
    return deadlineMs !== null && deadlineMs <= nowMs;
  });

  const sourceLots = (activeTab === "past" ? pastSource : activeSource).sort(
    (a: any, b: any) =>
      new Date(b.lot.created_at).getTime() - new Date(a.lot.created_at).getTime()
  );

  const cards = sourceLots.map((hl: any, index: number) => {
    const lot = hl.lot;
    const tiers = tiersMap[lot.id] || [];
    const committed = Number(lot.committed_quantity_kg || 0);
    const minCommitment = Number(lot.min_commitment_kg || 0);

    const currentPrice = (() => {
      if (tiers.length === 0) return Number(lot.price_per_kg);
      const sortedDesc = [...tiers].sort(
        (a: any, b: any) => b.min_quantity_kg - a.min_quantity_kg
      );
      for (const t of sortedDesc) {
        if (committed >= t.min_quantity_kg) return Number(t.price_per_kg);
      }
      return Number(lot.price_per_kg);
    })();

    const lowestPrice =
      tiers.length > 0
        ? Math.min(...tiers.map((t: any) => Number(t.price_per_kg)))
        : Number(lot.price_per_kg);

    const nextTier = tiers.find((t: any) => committed < t.min_quantity_kg) || null;

    const nextMilestone =
      committed < minCommitment
        ? {
            label: "Trigger campaign",
            targetKg: minCommitment,
            remainingKg: Math.max(0, minCommitment - committed),
            nextPricePerKg: null as number | null,
          }
        : nextTier
          ? {
              label: "Next tier",
              targetKg: Number(nextTier.min_quantity_kg),
              remainingKg: Math.max(0, Number(nextTier.min_quantity_kg) - committed),
              nextPricePerKg: Number(nextTier.price_per_kg),
            }
          : {
              label: "Best tier reached",
              targetKg: committed,
              remainingKg: 0,
              nextPricePerKg: null as number | null,
            };

    const milestoneTargets = [minCommitment, ...tiers.map((t: any) => Number(t.min_quantity_kg))]
      .filter((v) => Number.isFinite(v) && v > 0)
      .sort((a, b) => a - b);
    const uniqueTargets = Array.from(new Set(milestoneTargets));
    const nextTarget = uniqueTargets.find((target) => committed < target) || null;
    const previousTarget =
      uniqueTargets
        .filter((target) => target <= committed)
        .sort((a, b) => b - a)[0] || 0;

    const progressPct = nextTarget
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(((committed - previousTarget) / (nextTarget - previousTarget)) * 100)
          )
        )
      : 100;

    return {
      hubId: hl.hub_id,
      hubName: getHubName(memberships || [], hl.hub_id),
      lot,
      isNewest: activeTab === "active" && index === 0,
      currentPrice,
      lowestPrice,
      nextMilestone,
      progressPct,
      progressTextTarget: nextTarget || previousTarget,
      invested: investedLotIds.has(lot.id),
      timeLeft: formatTimeLeft(lot.commitment_deadline),
    };
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Buyer Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Active and past lots from your hubs.
          </p>
        </div>
        <LeaveHubButton hubName={getHubName(memberships || [], hubIds[0])} />
      </div>

      <div className="mb-6 flex items-center gap-2 border-b pb-2">
        <Link
          href="/dashboard/buyer"
          className={`rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "active" ? "text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Active Lots
        </Link>
        <Link
          href="/dashboard/buyer?tab=past"
          className={`rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "past" ? "text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Past Lots
        </Link>
      </div>

      {cards.length === 0 ? (
        <Card className="border-dashed shadow-sm">
          <CardContent className="flex flex-col items-center py-12">
            <Coffee className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="text-lg font-medium text-foreground">
              {activeTab === "past" ? "No past lots" : "No active lots"}
            </h3>
            <p className="mt-2 max-w-md text-center text-sm text-muted-foreground">
              {activeTab === "past"
                ? "No lots in your hubs have reached their deadline yet."
                : "Your hubs don\'t have any active campaigns right now. Check back soon."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {cards.map((card) => (
            <Link
              key={`${card.hubId}-${card.lot.id}`}
              href={`/dashboard/buyer/lot/${card.lot.id}?hub=${card.hubId}`}
              className="block"
            >
              <Card
                className={`overflow-hidden shadow-sm transition-shadow hover:shadow-md ${
                  card.isNewest ? "ring-2 ring-primary/25 border-primary/40" : ""
                }`}
              >
                <div className="flex flex-col md:min-h-[300px] md:flex-row md:items-stretch">
                  <div className="h-56 md:h-auto md:w-[320px] md:flex-shrink-0">
                    <img
                      src={card.lot.images?.[0] || "/placeholder.jpg"}
                      alt={card.lot.title}
                      className="block h-full w-full object-cover"
                    />
                  </div>

                  <div className="flex flex-1 flex-col">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs text-muted-foreground">{card.hubName}</p>
                          <CardTitle className="text-lg leading-snug">{card.lot.title}</CardTitle>
                          <p className="text-sm text-muted-foreground">
                            {card.lot.origin_country}
                            {card.lot.region ? `, ${card.lot.region}` : ""}
                          </p>
                        </div>
                        {card.lot.score && <Badge variant="secondary">{card.lot.score} pts</Badge>}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {card.isNewest && (
                          <Badge className="border-primary/20 bg-primary/10 text-primary">
                            Newest Lot
                          </Badge>
                        )}
                        {card.invested && (
                          <Badge className="border border-accent/20 bg-accent/15 text-accent-foreground">
                            You&apos;re invested
                          </Badge>
                        )}
                        {activeTab === "past" && <Badge variant="outline">Deadline Passed</Badge>}
                      </div>
                    </CardHeader>

                    <CardContent className="grid flex-1 gap-4 pb-5 md:grid-cols-3">
                      <div className="space-y-3">
                        <div>
                          <p className="text-xl font-bold text-foreground">
                            <UnitPriceText
                              pricePerKg={card.currentPrice}
                              currency={card.lot.currency || "USD"}
                              includePlatformFee
                            />
                          </p>
                          {card.lowestPrice < card.currentPrice && (
                            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                              <TrendingDown className="h-3 w-3" />
                              As low as{" "}
                              <UnitPriceText
                                pricePerKg={card.lowestPrice}
                                currency={card.lot.currency || "USD"}
                                includePlatformFee
                              />
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          <span>Time Left: {card.timeLeft}</span>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <div className="mb-1.5 flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Funding Progress</span>
                            <span className="text-muted-foreground">
                              <UnitWeightText kg={Number(card.lot.committed_quantity_kg)} /> /{" "}
                              <UnitWeightText kg={Number(card.progressTextTarget)} />
                            </span>
                          </div>
                          <Progress value={card.progressPct} className="h-2" />
                          <p className="mt-1 text-xs text-muted-foreground">
                            {card.progressPct}% to next milestone
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-muted-foreground">Next Milestone</p>
                          <p className="flex items-center gap-1 text-sm font-medium text-foreground">
                            <Target className="h-3.5 w-3.5" />
                            {card.nextMilestone.label}
                            {card.nextMilestone.nextPricePerKg !== null && (
                              <span className="text-muted-foreground">
                                (<UnitPriceText
                                  pricePerKg={card.nextMilestone.nextPricePerKg}
                                  currency={card.lot.currency || "USD"}
                                  includePlatformFee
                                />)
                              </span>
                            )}
                          </p>
                          {card.nextMilestone.remainingKg > 0 ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              <UnitWeightText kg={card.nextMilestone.remainingKg} /> needed
                            </p>
                          ) : (
                            <p className="mt-1 text-xs text-muted-foreground">No further milestone remaining</p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-3">
                        {Array.isArray(card.lot.flavor_notes) && card.lot.flavor_notes.length > 0 && (
                          <div>
                            <p className="mb-1.5 text-xs text-muted-foreground">Tasting Notes</p>
                            <div className="flex flex-wrap gap-1">
                              {card.lot.flavor_notes.slice(0, 6).map((note: string) => (
                                <Badge key={`note-${card.lot.id}-${note}`} variant="outline" className="text-[11px]">
                                  {note}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {Array.isArray(card.lot.certifications) && card.lot.certifications.length > 0 && (
                          <div>
                            <p className="mb-1.5 text-xs text-muted-foreground">Certifications</p>
                            <div className="flex flex-wrap gap-1">
                              {card.lot.certifications.slice(0, 6).map((cert: string) => (
                                <Badge key={`cert-${card.lot.id}-${cert}`} variant="secondary" className="text-[11px]">
                                  {cert}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
