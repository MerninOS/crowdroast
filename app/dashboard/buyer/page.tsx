import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CardContent } from "@merninos/ui";
import { Progress } from "@/components/ui/progress";
import { Clock, Coffee, Target, TrendingDown, Warehouse, Search } from "lucide-react";
import Link from "next/link";
import { Button } from "@merninos/ui";
import { UnitPriceText, UnitWeightText } from "@/components/unit-value";
import { LeaveHubButton } from "@/components/leave-hub-button";
import { FeaturedRoastHero } from "@/components/featured-roast-hero";

function getHubName(memberships: any[], hubId: string) {
  const membership = memberships.find((m: any) => m.hub_id === hubId);
  const hubRel = membership?.hub;
  return Array.isArray(hubRel)
    ? (hubRel[0] as any)?.name || "Hub"
    : (hubRel as any)?.name || "Hub";
}

function getHubFeaturedLotId(memberships: any[]): string | null {
  const hub = memberships?.[0]?.hub;
  const h = Array.isArray(hub) ? hub[0] : hub;
  return (h as any)?.featured_lot_id ?? null;
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
  searchParams?: Promise<{ tab?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const resolvedSearchParams = await searchParams;
  const activeTab = resolvedSearchParams?.tab === "past" ? "past" : "active";

  const { data: memberships } = await supabase
    .from("hub_members")
    .select("hub_id, hub:hubs!hub_members_hub_id_fkey(name, featured_lot_id)")
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

        <div className="border-dashed border-2 border-fog rounded-xl bg-chalk p-10 flex flex-col items-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-fog/50 text-espresso/50">
            <Warehouse className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold text-espresso">No Hub Membership Yet</h3>
          <p className="mt-2 max-w-sm text-center text-sm leading-relaxed text-espresso/60">
            Join a hub to browse and commit to coffee lots. Find one near you or request access directly.
          </p>
          <Button asChild className="mt-4">
            <Link href="/dashboard/find-hub">
              <Search className="mr-2 h-4 w-4" />
              Find a Hub
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const { data: activeCampaigns } = await supabase
    .from("campaigns")
    .select(
      "id, hub_id, lot_id, deadline, status, created_at, lot:lots!campaigns_lot_id_fkey(*, seller:profiles!lots_seller_id_fkey(company_name, contact_name))"
    )
    .in("hub_id", hubIds)
    .eq("status", "active");

  const allLots = (activeCampaigns || []).filter((c: any) => Boolean(c?.lot)).map((c: any) => ({
    ...c,
    lot: { ...c.lot, campaign_deadline: c.deadline },
  }));
  const allLotIds = allLots.map((c: any) => c.lot_id).filter(Boolean);

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
    const deadlineMs = hl.lot.campaign_deadline
      ? new Date(hl.lot.campaign_deadline).getTime()
      : null;
    const isPast = deadlineMs !== null && deadlineMs <= nowMs;
    return hl.lot.status === "active" && !isPast;
  });

  const pastSource = allLots.filter((hl: any) => {
    const deadlineMs = hl.lot.campaign_deadline
      ? new Date(hl.lot.campaign_deadline).getTime()
      : null;
    return deadlineMs !== null && deadlineMs <= nowMs;
  });

  // Derive featured lot: explicit hub pick → newest active campaign → null
  const hubFeaturedLotId = getHubFeaturedLotId(memberships || []);
  const featuredCampaign = (() => {
    if (!activeSource.length) return null;
    if (hubFeaturedLotId) {
      const explicit = activeSource.find((c: any) => c.lot_id === hubFeaturedLotId);
      if (explicit) return explicit;
    }
    return [...activeSource].sort(
      (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0] ?? null;
  })();

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
      timeLeft: formatTimeLeft(lot.campaign_deadline),
    };
  });

  return (
    <div>
      {/* Featured Roast hero — renders above everything when an active lot is available */}
      {activeTab === "active" && (
        <div className="-mx-6 mb-8">
          <FeaturedRoastHero
            lot={featuredCampaign?.lot ?? null}
            campaignId={featuredCampaign?.id ?? null}
          />
        </div>
      )}

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{ fontFamily: "'Cal Sans', system-ui, sans-serif", color: "#1C0F05" }}
          >
            Your Lots
          </h1>
          <p className="mt-1 text-sm" style={{ color: "#7A6A50" }}>
            Active and past lots from your hub.
          </p>
        </div>
        <LeaveHubButton hubName={getHubName(memberships || [], hubIds[0])} />
      </div>

      <div
        className="mb-6 flex items-center gap-2 border-b pb-2"
        style={{ borderColor: "#D8D0B8" }}
      >
        <Link
          href="/dashboard/buyer"
          className="rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors"
          style={{
            fontFamily: "'Cal Sans', system-ui, sans-serif",
            fontWeight: activeTab === "active" ? 800 : 500,
            color: activeTab === "active" ? "#5A7A3A" : "#7A6A50",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            fontSize: 11,
          }}
        >
          Active Lots
        </Link>
        <Link
          href="/dashboard/buyer?tab=past"
          className="rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors"
          style={{
            fontFamily: "'Cal Sans', system-ui, sans-serif",
            fontWeight: activeTab === "past" ? 800 : 500,
            color: activeTab === "past" ? "#5A7A3A" : "#7A6A50",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            fontSize: 11,
          }}
        >
          Past Lots
        </Link>
      </div>

      {cards.length === 0 ? (
        <div
          className="flex flex-col items-center py-12 rounded-xl border-5 border-espresso"
          style={{ background: "#FDFAF0", boxShadow: "5px 5px 0 #1C0F05" }}
        >
          <Coffee className="mb-4 h-12 w-12" style={{ color: "#7A6A50", opacity: 0.5 }} />
          <h3
            className="text-lg font-medium"
            style={{ fontFamily: "'Cal Sans', system-ui, sans-serif", color: "#1C0F05" }}
          >
            {activeTab === "past" ? "No past lots" : "Nothing brewing"}
          </h3>
          <p className="mt-2 max-w-md text-center text-sm" style={{ color: "#7A6A50" }}>
            {activeTab === "past"
              ? "No lots in your hub have reached their deadline yet."
              : "Your hub doesn't have any active campaigns right now. Check back soon."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {cards.map((card) => (
            <Link
              key={`${card.hubId}-${card.lot.id}`}
              href={`/dashboard/buyer/lot/${card.lot.id}?hub=${card.hubId}`}
              className="block group"
            >
              <div
                className="overflow-hidden transition-all duration-150 rounded-xl border-5 border-espresso bg-chalk"
                style={{
                  boxShadow: "5px 5px 0 #1C0F05",
                  ...(card.isNewest ? { borderColor: "#5A7A3A" } : {}),
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.transform = "translate(-3px, -3px)";
                  (e.currentTarget as HTMLElement).style.boxShadow = "8px 8px 0 #1C0F05";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.transform = "";
                  (e.currentTarget as HTMLElement).style.boxShadow = "5px 5px 0 #1C0F05";
                }}
              >
                <div className="flex flex-col md:min-h-[280px] md:flex-row md:items-stretch">
                  <div className="h-56 md:h-auto md:w-[280px] md:flex-shrink-0">
                    <img
                      src={card.lot.images?.[0] || "/placeholder.jpg"}
                      alt={card.lot.title}
                      className="block h-full w-full object-cover"
                      style={{ borderRight: "3px solid #1C0F05" }}
                    />
                  </div>

                  <div className="flex flex-1 flex-col p-6 gap-4">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p
                          className="text-xs mb-1"
                          style={{
                            fontFamily: "'Cal Sans', system-ui, sans-serif",
                            fontWeight: 700,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            color: "#7A6A50",
                          }}
                        >
                          {card.hubName}
                        </p>
                        <h3
                          className="text-lg leading-snug"
                          style={{
                            fontFamily: "'Cal Sans', system-ui, sans-serif",
                            fontWeight: 800,
                            color: "#1C0F05",
                          }}
                        >
                          {card.lot.title}
                        </h3>
                        <p className="text-sm mt-0.5" style={{ color: "#7A6A50" }}>
                          {card.lot.origin_country}
                          {card.lot.region ? `, ${card.lot.region}` : ""}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {card.lot.score && (
                          <span
                            style={{
                              fontFamily: "'Cal Sans', system-ui, sans-serif",
                              fontSize: 11,
                              fontWeight: 800,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                              padding: "4px 10px",
                              border: "2px solid #1C0F05",
                              borderRadius: 9999,
                              background: "#F5C842",
                              color: "#1C0F05",
                              boxShadow: "2px 2px 0 #1C0F05",
                            }}
                          >
                            {card.lot.score} pts
                          </span>
                        )}
                        {card.isNewest && (
                          <span
                            style={{
                              fontFamily: "'Cal Sans', system-ui, sans-serif",
                              fontSize: 10,
                              fontWeight: 800,
                              letterSpacing: "0.1em",
                              textTransform: "uppercase",
                              padding: "3px 10px",
                              border: "2px solid #1C0F05",
                              borderRadius: 9999,
                              background: "#5A7A3A",
                              color: "#FDFAF0",
                            }}
                          >
                            New
                          </span>
                        )}
                        {card.invested && (
                          <span
                            style={{
                              fontFamily: "'Cal Sans', system-ui, sans-serif",
                              fontSize: 10,
                              fontWeight: 800,
                              letterSpacing: "0.1em",
                              textTransform: "uppercase",
                              padding: "3px 10px",
                              border: "2px solid #1C0F05",
                              borderRadius: 9999,
                              background: "#E8913A",
                              color: "#1C0F05",
                            }}
                          >
                            Invested
                          </span>
                        )}
                        {activeTab === "past" && (
                          <span
                            style={{
                              fontFamily: "'Cal Sans', system-ui, sans-serif",
                              fontSize: 10,
                              fontWeight: 800,
                              letterSpacing: "0.1em",
                              textTransform: "uppercase",
                              padding: "3px 10px",
                              border: "2px dashed #1C0F05",
                              borderRadius: 9999,
                              background: "transparent",
                              color: "#7A6A50",
                            }}
                          >
                            Ended
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Body grid */}
                    <div
                      className="grid flex-1 gap-4 pt-4"
                      style={{
                        gridTemplateColumns: "repeat(3, 1fr)",
                        borderTop: "1.5px dashed #1C0F05",
                      }}
                    >
                      {/* Price + time */}
                      <div className="space-y-3">
                        <div>
                          <p
                            className="text-xl font-bold"
                            style={{ fontFamily: "'Cal Sans', system-ui, sans-serif", color: "#1C0F05" }}
                          >
                            <UnitPriceText
                              pricePerKg={card.currentPrice}
                              currency={card.lot.currency || "USD"}
                              includePlatformFee
                            />
                          </p>
                          {card.lowestPrice < card.currentPrice && (
                            <p className="mt-0.5 flex items-center gap-1 text-xs" style={{ color: "#7A6A50" }}>
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
                        <div className="flex items-center gap-1.5 text-xs" style={{ color: "#7A6A50" }}>
                          <Clock className="h-3.5 w-3.5" />
                          <span>{card.timeLeft}</span>
                        </div>
                      </div>

                      {/* Progress */}
                      <div className="space-y-3">
                        <div>
                          <div className="mb-1.5 flex items-center justify-between text-xs">
                            <span
                              style={{
                                fontFamily: "'Cal Sans', system-ui, sans-serif",
                                fontWeight: 700,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                fontSize: 10,
                                color: "#7A6A50",
                              }}
                            >
                              Pack Progress
                            </span>
                            <span style={{ color: "#7A6A50", fontSize: 11 }}>
                              <UnitWeightText kg={Number(card.lot.committed_quantity_kg)} /> /{" "}
                              <UnitWeightText kg={Number(card.progressTextTarget)} />
                            </span>
                          </div>
                          <div
                            style={{
                              height: 8,
                              background: "#D8D0B8",
                              border: "2px solid #1C0F05",
                              borderRadius: 999,
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                width: `${Math.min(card.progressPct, 100)}%`,
                                height: "100%",
                                background: "#5A7A3A",
                                borderRadius: 999,
                              }}
                            />
                          </div>
                          <p className="mt-1 text-xs" style={{ color: "#7A6A50" }}>
                            {card.progressPct}% to next milestone
                          </p>
                        </div>

                        <div>
                          <p
                            className="text-xs"
                            style={{
                              fontFamily: "'Cal Sans', system-ui, sans-serif",
                              fontWeight: 700,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                              fontSize: 10,
                              color: "#7A6A50",
                            }}
                          >
                            Next Milestone
                          </p>
                          <p className="flex items-center gap-1 text-sm font-medium mt-0.5" style={{ color: "#1C0F05" }}>
                            <Target className="h-3.5 w-3.5" />
                            {card.nextMilestone.label}
                            {card.nextMilestone.nextPricePerKg !== null && (
                              <span style={{ color: "#7A6A50" }}>
                                (<UnitPriceText
                                  pricePerKg={card.nextMilestone.nextPricePerKg}
                                  currency={card.lot.currency || "USD"}
                                  includePlatformFee
                                />)
                              </span>
                            )}
                          </p>
                          {card.nextMilestone.remainingKg > 0 ? (
                            <p className="mt-1 text-xs" style={{ color: "#7A6A50" }}>
                              <UnitWeightText kg={card.nextMilestone.remainingKg} /> needed
                            </p>
                          ) : (
                            <p className="mt-1 text-xs" style={{ color: "#7A6A50" }}>Best tier reached</p>
                          )}
                        </div>
                      </div>

                      {/* Flavor notes + certs */}
                      <div className="space-y-3">
                        {Array.isArray(card.lot.flavor_notes) && card.lot.flavor_notes.length > 0 && (
                          <div>
                            <p
                              className="mb-1.5"
                              style={{
                                fontFamily: "'Cal Sans', system-ui, sans-serif",
                                fontWeight: 700,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                fontSize: 10,
                                color: "#7A6A50",
                              }}
                            >
                              Tasting Notes
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {card.lot.flavor_notes.slice(0, 6).map((note: string) => (
                                <span
                                  key={`note-${card.lot.id}-${note}`}
                                  style={{
                                    padding: "3px 9px",
                                    border: "1.5px dashed #1C0F05",
                                    borderRadius: 4,
                                    background: "transparent",
                                    fontFamily: "'Cal Sans', system-ui, sans-serif",
                                    fontWeight: 600,
                                    fontSize: 11,
                                    color: "#1C0F05",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {note}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {Array.isArray(card.lot.certifications) && card.lot.certifications.length > 0 && (
                          <div>
                            <p
                              className="mb-1.5"
                              style={{
                                fontFamily: "'Cal Sans', system-ui, sans-serif",
                                fontWeight: 700,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                fontSize: 10,
                                color: "#7A6A50",
                              }}
                            >
                              Certifications
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {card.lot.certifications.slice(0, 6).map((cert: string) => (
                                <span
                                  key={`cert-${card.lot.id}-${cert}`}
                                  style={{
                                    padding: "3px 9px",
                                    border: "2px solid #1C0F05",
                                    borderRadius: 9999,
                                    background: "#F5C842",
                                    fontFamily: "'Cal Sans', system-ui, sans-serif",
                                    fontWeight: 700,
                                    fontSize: 11,
                                    color: "#1C0F05",
                                  }}
                                >
                                  {cert}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
