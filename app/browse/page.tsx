import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/site-header";
import { UnitPriceText, UnitWeightText } from "@/components/unit-value";
import { Clock, TrendingDown } from "lucide-react";
import Link from "next/link";

const marqueeItems = [
  "Specialty green coffee",
  "✦",
  "Hub-curated lots",
  "✦",
  "Group buying. Better pricing.",
  "✦",
  "Commit together. Save together.",
  "✦",
  "100% refunded if minimums aren't met",
  "✦",
];

export default async function BrowsePage() {
  const supabase = await createClient();

  // Fetch lots with active campaigns — only campaigned lots are public
  const { data: activeCampaigns } = await supabase
    .from("campaigns")
    .select(
      "id, hub_id, lot_id, deadline, status, hub:hubs!campaigns_hub_id_fkey(id, name, city, state), lot:lots!campaigns_lot_id_fkey(*, seller:profiles!lots_seller_id_fkey(company_name, contact_name))"
    )
    .eq("status", "active");

  const lotIds = (activeCampaigns || []).map((c: any) => c.lot_id).filter(Boolean);

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
  const hubMap: Record<string, { hub: any; lots: any[] }> = {};
  for (const c of activeCampaigns || []) {
    const cAny = c as any;
    if (!cAny.lot || !cAny.hub) continue;
    if (!hubMap[cAny.hub_id]) {
      hubMap[cAny.hub_id] = { hub: cAny.hub, lots: [] };
    }
    hubMap[cAny.hub_id].lots.push({
      ...cAny.lot,
      hub_id: cAny.hub_id,
      campaign_deadline: cAny.deadline,
      pricing_tiers: tiersMap[cAny.lot_id] || [],
    });
  }

  const hubs = Object.values(hubMap).filter((g) => g.lots.length > 0);

  return (
    <div className="flex min-h-svh flex-col bg-cream">
      {/* ─── MARQUEE BAR ──────────────────────────────────────────────── */}
      <div className="bg-tomato overflow-hidden py-2.5 border-b-3 border-espresso">
        <div
          className="inline-flex gap-8 whitespace-nowrap text-cream text-[11px] font-bold uppercase tracking-[0.12em] marquee-track"
          aria-hidden="true"
        >
          {[...Array(2)].map((_, i) => (
            <span key={i} className="inline-flex gap-8 pr-8">
              {marqueeItems.map((item, j) => (
                <span key={j}>{item}</span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <SiteHeader />

      {/* ─── HERO ─────────────────────────────────────────────────────── */}
      <section className="bg-cream px-4 pt-14 pb-10 border-b-5 border-espresso">
        <div className="mx-auto max-w-7xl">
          <p className="inline-flex items-center gap-2 bg-sun border-3 border-espresso rounded-pill px-4 py-1.5 text-xs font-bold uppercase tracking-[0.1em] text-espresso mb-6 shadow-flat-sm font-body">
            Live lots
          </p>
          <h1 className="font-display text-[clamp(3rem,7vw,5rem)] leading-[0.9] text-espresso uppercase mb-4">
            Browse the lots.{" "}
            <span className="text-tomato">Commit to save.</span>
          </h1>
          <p className="text-lg text-[#7A6A50] max-w-xl leading-relaxed font-body">
            Hub owners curate the best green coffee available. Join a hub to
            commit volume and unlock group pricing.
          </p>
        </div>
      </section>

      {/* ─── LOT LISTINGS ─────────────────────────────────────────────── */}
      <section className="px-4 py-14">
        <div className="mx-auto max-w-7xl">
          {hubs.length === 0 ? (
            <div className="border-5 border-espresso border-dashed rounded-lg p-16 text-center shadow-flat-md bg-chalk">
              <p className="font-display text-3xl text-espresso uppercase mb-2">
                Nothing here yet.
              </p>
              <p className="text-[#7A6A50] font-body">
                Lots are added by hub owners. Check back soon.
              </p>
            </div>
          ) : (
            <div className="space-y-14">
              {hubs.map(({ hub, lots }) => (
                <div key={hub.id}>
                  {/* Hub header */}
                  <div className="flex items-baseline gap-4 mb-6 border-b-3 border-espresso pb-3">
                    <h2 className="font-display text-3xl text-espresso uppercase">
                      {hub.name}
                    </h2>
                    {(hub.city || hub.state) && (
                      <span className="font-body text-sm font-bold uppercase tracking-[0.08em] text-[#7A6A50]">
                        {[hub.city, hub.state].filter(Boolean).join(", ")}
                      </span>
                    )}
                  </div>

                  {/* Lot cards */}
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {lots.map((lot: any) => {
                      const tiers = lot.pricing_tiers || [];
                      const lowestPrice =
                        tiers.length > 0
                          ? Math.min(...tiers.map((t: any) => t.price_per_kg))
                          : lot.price_per_kg;

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

                      const hasDeadline = !!lot.campaign_deadline;
                      const deadlineDate = hasDeadline
                        ? new Date(lot.campaign_deadline)
                        : null;
                      const isExpired =
                        deadlineDate && deadlineDate.getTime() < Date.now();

                      return (
                        <Link
                          key={lot.id}
                          href={`/browse/${lot.id}`}
                          className="group block"
                        >
                          <div className="bg-chalk border-5 border-espresso rounded-lg shadow-flat-md transition-all duration-150 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-flat-lg active:translate-x-1 active:translate-y-1 active:shadow-none overflow-hidden h-full flex flex-col">
                            {/* Image */}
                            <div className="overflow-hidden border-b-5 border-espresso h-44 bg-fog">
                              <img
                                src={lot.images?.[0] || "/placeholder.jpg"}
                                alt={lot.title}
                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                              />
                            </div>

                            <div className="p-5 flex flex-col gap-3 flex-1">
                              {/* Title + score */}
                              <div className="flex items-start justify-between gap-2">
                                <h3 className="font-body font-bold text-base text-espresso leading-snug group-hover:text-tomato transition-colors">
                                  {lot.title}
                                </h3>
                                {lot.score && (
                                  <span className="shrink-0 bg-sun border-2 border-espresso rounded-pill px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-espresso">
                                    {lot.score} pts
                                  </span>
                                )}
                              </div>

                              {/* Origin */}
                              <p className="text-sm text-[#7A6A50] font-body">
                                {lot.origin_country}
                                {lot.region ? `, ${lot.region}` : ""}
                              </p>

                              {/* Price */}
                              <div className="flex items-baseline justify-between">
                                <span className="text-xl font-bold text-espresso font-body">
                                  <UnitPriceText
                                    pricePerKg={currentPrice}
                                    currency={lot.currency || "USD"}
                                    includePlatformFee
                                  />
                                </span>
                                {tiers.length > 0 &&
                                  lowestPrice < currentPrice && (
                                    <span className="flex items-center gap-1 text-xs font-bold text-tomato font-body border-2 border-tomato rounded-pill px-2 py-0.5">
                                      <TrendingDown className="h-3 w-3" />
                                      As low as{" "}
                                      <UnitPriceText
                                        pricePerKg={lowestPrice}
                                        currency={lot.currency || "USD"}
                                        includePlatformFee
                                      />
                                    </span>
                                  )}
                              </div>

                              {/* Trigger progress */}
                              <div>
                                <div className="flex justify-between text-xs text-[#7A6A50] mb-1.5 font-body font-bold uppercase tracking-wide">
                                  <span>
                                    {isTriggered
                                      ? "Sale triggered ✦"
                                      : `${triggerPct}% to trigger`}
                                  </span>
                                  <span>
                                    <UnitWeightText
                                      kg={lot.committed_quantity_kg}
                                    />{" "}
                                    /{" "}
                                    <UnitWeightText kg={lot.min_commitment_kg} />
                                  </span>
                                </div>
                                <div className="h-2 w-full bg-fog border-2 border-espresso rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${isTriggered ? "bg-matcha" : "bg-tomato"}`}
                                    style={{ width: `${triggerPct}%` }}
                                  />
                                </div>
                              </div>

                              {/* Deadline */}
                              {hasDeadline && (
                                <div className="flex items-center gap-1.5 text-xs text-[#7A6A50] font-body font-bold uppercase tracking-wide">
                                  <Clock className="h-3 w-3" />
                                  {isExpired ? (
                                    <span className="text-tomato">
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
                                  <div className="flex flex-wrap gap-1.5 mt-auto">
                                    {lot.flavor_notes
                                      .slice(0, 3)
                                      .map((note: string) => (
                                        <span
                                          key={note}
                                          className="border-2 border-espresso rounded-pill px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-espresso font-body"
                                        >
                                          {note}
                                        </span>
                                      ))}
                                    {lot.flavor_notes.length > 3 && (
                                      <span className="border-2 border-fog rounded-pill px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#7A6A50] font-body">
                                        +{lot.flavor_notes.length - 3}
                                      </span>
                                    )}
                                  </div>
                                )}
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ─── FOOTER CTA ───────────────────────────────────────────────── */}
      <section className="bg-tomato border-t-5 border-espresso px-4 py-16 mt-auto">
        <div className="mx-auto max-w-7xl text-center">
          <h2 className="font-display text-[clamp(2.5rem,5vw,4rem)] text-cream uppercase leading-[0.9] mb-4">
            Ready to commit?
          </h2>
          <p className="text-cream/80 font-body text-lg mb-8 max-w-md mx-auto">
            Create an account and request access to a hub to start buying at
            group pricing.
          </p>
          <Link
            href="/auth/sign-up"
            className="inline-flex items-center justify-center bg-cream text-espresso border-3 border-espresso rounded-pill px-8 py-3 text-sm font-bold uppercase tracking-[0.1em] shadow-flat-sm hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-flat-md active:translate-x-1 active:translate-y-1 active:shadow-none transition-all duration-100 font-body"
          >
            Create your account
          </Link>
        </div>
      </section>
    </div>
  );
}
