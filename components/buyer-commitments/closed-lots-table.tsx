import Link from "next/link";
import { UnitPriceText, UnitWeightText } from "@/components/unit-value";
import { stageOfGroup, STAGE_META, type CommitmentGroup, type StageColor } from "./bucket-by-lifecycle";

export interface ClosedLotsTableProps {
  groups: CommitmentGroup[];
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);

const stageBadgeStyles: Record<StageColor, string> = {
  tomato:   "bg-tomato text-cream",
  honey:    "bg-honey text-espresso",
  sky:      "bg-sky text-espresso",
  sun:      "bg-sun text-espresso",
  matcha:   "bg-matcha text-cream",
  fog:      "bg-fog text-espresso",
  espresso: "bg-espresso text-cream",
};

function StageBadge({ stage }: { stage: ReturnType<typeof stageOfGroup> }) {
  const meta = STAGE_META[stage];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border-[2.5px] border-espresso px-2.5 py-[3px] font-headline text-[10px] font-extrabold uppercase tracking-[0.1em] ${stageBadgeStyles[meta.color]}`}
    >
      {meta.label}
    </span>
  );
}

function rowDate(g: CommitmentGroup): string | null {
  const pickedUp = g.commitments.map((c) => c.picked_up_at).filter((d): d is string => !!d);
  if (pickedUp.length) return pickedUp.sort().reverse()[0];
  if (g.lot?.settlement_processed_at) return g.lot.settlement_processed_at;
  return g.commitments[0]?.created_at ?? null;
}

function buildRow(g: CommitmentGroup) {
  const stage = stageOfGroup(g);
  const succeeded = g.commitments.filter((c) => c.payment_status === "charge_succeeded");
  const securedKg = succeeded.reduce((s, c) => s + Number(c.quantity_kg || 0), 0);
  const paid = succeeded.reduce(
    (s, c) => s + (c.charge_amount_cents != null ? c.charge_amount_cents / 100 : Number(c.total_price || 0)),
    0
  );
  const billed = succeeded.reduce((s, c) => s + Number(c.total_price || 0), 0);
  const refunded = Math.max(0, billed - paid);
  const avg = securedKg > 0 ? paid / securedKg : Number(g.lot?.price_per_kg || 0);
  const totalCell = stage === "minimum_not_met" ? `−${fmtMoney(refunded)}` : fmtMoney(paid);
  const date = rowDate(g);
  return { stage, securedKg, avg, totalCell, date };
}

export function ClosedLotsTable({ groups }: ClosedLotsTableProps) {
  return (
    <>
      {/* Phone: stacked card list (the 6-col table won't fit) */}
      <div className="flex flex-col gap-3 md:hidden">
        {groups.map((g) => {
          const r = buildRow(g);
          return (
            <div
              key={g.groupKey}
              className="rounded-[14px] border-[3px] border-espresso bg-chalk p-4 shadow-flat-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/dashboard/buyer/lot/${g.lotId}${g.hubId ? `?hub=${g.hubId}` : ""}`}
                    className="font-headline text-[16px] font-bold leading-tight text-espresso hover:text-tomato"
                  >
                    {g.lot?.title || "Unknown lot"}
                  </Link>
                  <div className="mt-0.5 font-headline text-[11px] text-espresso/60">
                    {[g.lot?.region, g.lot?.origin_country].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <StageBadge stage={r.stage} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 font-headline text-[12px]">
                <div>
                  <div className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-espresso/55">Qty</div>
                  <div className="mt-0.5 font-bold text-espresso">
                    <UnitWeightText kg={r.securedKg} maximumFractionDigits={0} />
                  </div>
                </div>
                <div>
                  <div className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-espresso/55">Avg price</div>
                  <div className="mt-0.5 font-bold text-espresso">
                    <UnitPriceText pricePerKg={r.avg} currency="usd" />
                  </div>
                </div>
                <div>
                  <div className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-espresso/55">Total</div>
                  <div className="mt-0.5 font-extrabold text-espresso">{r.totalCell}</div>
                </div>
              </div>
              {r.date && (
                <div className="mt-2 font-headline text-[11px] text-espresso/55">
                  {new Date(r.date).toLocaleDateString()}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tablet+: the 6-column table */}
      <div className="hidden overflow-hidden rounded-[14px] border-[3px] border-espresso bg-chalk shadow-flat-md md:block">
        <div className="grid grid-cols-[1.6fr_1fr_0.8fr_0.9fr_0.9fr_0.9fr] gap-4 bg-espresso px-5 py-3 font-headline text-[10px] font-extrabold uppercase tracking-[0.18em] text-cream">
          <div>Lot</div>
          <div>Status</div>
          <div>Qty</div>
          <div>Avg price</div>
          <div>Total</div>
          <div>Date</div>
        </div>
        {groups.map((g, i) => {
          const r = buildRow(g);
          return (
            <div
              key={g.groupKey}
              className={`grid grid-cols-[1.6fr_1fr_0.8fr_0.9fr_0.9fr_0.9fr] items-center gap-4 px-5 py-3.5 font-headline text-[13px] ${
                i < groups.length - 1 ? "border-b border-fog" : ""
              }`}
            >
              <div>
                <Link
                  href={`/dashboard/buyer/lot/${g.lotId}${g.hubId ? `?hub=${g.hubId}` : ""}`}
                  className="font-headline text-[15px] font-bold leading-tight text-espresso transition-colors hover:text-tomato"
                >
                  {g.lot?.title || "Unknown lot"}
                </Link>
                <div className="mt-0.5 text-[11px] text-espresso/60">
                  {[g.lot?.region, g.lot?.origin_country].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div>
                <StageBadge stage={r.stage} />
              </div>
              <div className="font-bold text-espresso">
                <UnitWeightText kg={r.securedKg} maximumFractionDigits={0} />
              </div>
              <div className="font-bold text-espresso">
                <UnitPriceText pricePerKg={r.avg} currency="usd" />
              </div>
              <div className="font-extrabold text-espresso">{r.totalCell}</div>
              <div className="text-[11px] text-espresso/60">{r.date ? new Date(r.date).toLocaleDateString() : "—"}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}
