import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Coffee, TrendingDown, Clock } from "lucide-react";
import Link from "next/link";

export default async function BuyerBrowsePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Get buyer's hub memberships
  const { data: memberships } = await supabase
    .from("hub_members")
    .select("hub_id, hub:hubs!hub_members_hub_id_fkey(name)")
    .eq("user_id", user.id)
    .eq("status", "active");

  const hubIds = (memberships || []).map((m: any) => m.hub_id);

  if (hubIds.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-foreground mb-6">
          Browse Lots
        </h1>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-12">
            <Coffee className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium text-foreground">
              No Hub Membership
            </h3>
            <p className="mt-2 text-sm text-muted-foreground text-center max-w-md">
              You need to be added to a hub before you can browse lots. Contact
              a hub owner to get invited.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Get all lots curated by the buyer's hubs
  const { data: hubLots } = await supabase
    .from("hub_lots")
    .select(
      "hub_id, lot_id, lot:lots!hub_lots_lot_id_fkey(*, seller:profiles!lots_seller_id_fkey(company_name, contact_name))"
    )
    .in("hub_id", hubIds);

  // Get pricing tiers for all these lots
  const lotIds = (hubLots || [])
    .map((hl: any) => hl.lot_id)
    .filter(Boolean);
  let tiersMap: Record<string, any[]> = {};
  if (lotIds.length > 0) {
    const { data: allTiers } = await supabase
      .from("pricing_tiers")
      .select("*")
      .in("lot_id", lotIds)
      .order("min_quantity_kg", { ascending: true });
    for (const tier of allTiers || []) {
      if (!tiersMap[tier.lot_id]) tiersMap[tier.lot_id] = [];
      tiersMap[tier.lot_id].push(tier);
    }
  }

  // Group lots by hub
  const lotsByHub: Record<string, { hubName: string; lots: any[] }> = {};
  for (const m of memberships || []) {
    const mAny = m as any;
    lotsByHub[mAny.hub_id] = {
      hubName: mAny.hub?.name || "Unknown Hub",
      lots: [],
    };
  }
  for (const hl of hubLots || []) {
    const hlAny = hl as any;
    if (hlAny.lot && lotsByHub[hlAny.hub_id]) {
      lotsByHub[hlAny.hub_id].lots.push({
        ...hlAny.lot,
        hub_id: hlAny.hub_id,
        pricing_tiers: tiersMap[hlAny.lot_id] || [],
      });
    }
  }

  const allLots = Object.values(lotsByHub).flatMap((g) => g.lots);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Browse Lots</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Lots curated by your hub{hubIds.length > 1 ? "s" : ""}. Prices drop
          as more buyers commit.
        </p>
      </div>

      {allLots.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-12">
            <Coffee className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium text-foreground">
              No lots available
            </h3>
            <p className="mt-2 text-sm text-muted-foreground text-center max-w-md">
              Your hub owner hasn&apos;t added any lots to the catalog yet.
              Check back soon!
            </p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(lotsByHub).map(([hubId, group]) => {
          if (group.lots.length === 0) return null;
          return (
            <div key={hubId} className="mb-8">
              {hubIds.length > 1 && (
                <h2 className="text-lg font-semibold text-foreground mb-4">
                  {group.hubName}
                </h2>
              )}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.lots.map((lot: any) => {
                  const triggerPct =
                    lot.min_commitment_kg > 0
                      ? Math.min(
                          100,
                          Math.round(
                            (lot.committed_quantity_kg /
                              lot.min_commitment_kg) *
                              100
                          )
                        )
                      : 0;
                  const isTriggered =
                    lot.committed_quantity_kg >= lot.min_commitment_kg;
                  const tiers = lot.pricing_tiers || [];
                  const lowestPrice =
                    tiers.length > 0
                      ? Math.min(...tiers.map((t: any) => t.price_per_kg))
                      : lot.price_per_kg;

                  // Current active price
                  let currentPrice = lot.price_per_kg;
                  const sortedDesc = [...tiers].sort(
                    (a: any, b: any) =>
                      b.min_quantity_kg - a.min_quantity_kg
                  );
                  for (const t of sortedDesc) {
                    if (lot.committed_quantity_kg >= t.min_quantity_kg) {
                      currentPrice = t.price_per_kg;
                      break;
                    }
                  }

                  const hasDeadline = !!lot.commitment_deadline;
                  const deadlineDate = hasDeadline
                    ? new Date(lot.commitment_deadline)
                    : null;
                  const isExpired =
                    deadlineDate && deadlineDate.getTime() < Date.now();

                  return (
                    <Link
                      key={lot.id}
                      href={`/dashboard/buyer/lot/${lot.id}?hub=${hubId}`}
                    >
                      <Card className="h-full transition-shadow hover:shadow-md cursor-pointer group">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-2">
                            <CardTitle className="text-base leading-snug group-hover:text-primary transition-colors">
                              {lot.title}
                            </CardTitle>
                            {lot.score && (
                              <Badge
                                variant="secondary"
                                className="shrink-0"
                              >
                                {lot.score} pts
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {lot.origin_country}
                            {lot.region ? `, ${lot.region}` : ""}
                          </p>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {/* Price display */}
                          <div className="flex items-baseline justify-between">
                            <div>
                              <span className="text-xl font-bold text-foreground">
                                ${currentPrice.toFixed(2)}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                /kg
                              </span>
                              {currentPrice !== lot.price_per_kg && (
                                <span className="ml-2 text-sm text-muted-foreground line-through">
                                  ${lot.price_per_kg.toFixed(2)}
                                </span>
                              )}
                            </div>
                            {tiers.length > 0 &&
                              lowestPrice < currentPrice && (
                                <Badge
                                  variant="outline"
                                  className="gap-1 text-xs text-primary border-primary/30"
                                >
                                  <TrendingDown className="h-3 w-3" />
                                  As low as ${lowestPrice.toFixed(2)}
                                </Badge>
                              )}
                          </div>

                          {/* Trigger progress */}
                          <div>
                            <div className="flex items-center justify-between text-xs mb-1.5">
                              <span className="text-muted-foreground">
                                {isTriggered
                                  ? "Sale triggered"
                                  : `${triggerPct}% to trigger`}
                              </span>
                              <span className="text-muted-foreground">
                                {lot.committed_quantity_kg.toLocaleString()}{" "}
                                / {lot.min_commitment_kg.toLocaleString()} kg
                              </span>
                            </div>
                            <Progress
                              value={triggerPct}
                              className={`h-2 ${isTriggered ? "[&>div]:bg-accent" : ""}`}
                            />
                          </div>

                          {/* Deadline */}
                          {hasDeadline && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {isExpired ? (
                                <span className="text-destructive">
                                  Deadline passed
                                </span>
                              ) : (
                                <span>
                                  Ends{" "}
                                  {deadlineDate!.toLocaleDateString(
                                    undefined,
                                    {
                                      month: "short",
                                      day: "numeric",
                                      year: "numeric",
                                    }
                                  )}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Flavor notes */}
                          {lot.flavor_notes &&
                            lot.flavor_notes.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {lot.flavor_notes
                                  .slice(0, 3)
                                  .map((note: string) => (
                                    <Badge
                                      key={note}
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      {note}
                                    </Badge>
                                  ))}
                                {lot.flavor_notes.length > 3 && (
                                  <Badge
                                    variant="outline"
                                    className="text-xs"
                                  >
                                    +{lot.flavor_notes.length - 3}
                                  </Badge>
                                )}
                              </div>
                            )}
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
