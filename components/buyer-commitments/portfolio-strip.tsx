import { StatCard } from "@merninos/ui";
import { UnitWeightText } from "@/components/unit-value";
import type { PortfolioStats } from "./bucket-by-lifecycle";

export interface PortfolioStripProps {
  stats: PortfolioStats;
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n || 0);

/**
 * 4-card portfolio strip for the buyer commitments page.
 *
 * Math definitions live in `bucket-by-lifecycle.ts:derivePortfolioStats`.
 * This component is presentation only.
 *
 * StatCard's value slot defaults to font-display (Adore Cats) at 38px and
 * the card frame uses p-4 / border-4 / shadow-flat-md. On this page we want
 * the strip to read as a compact KPI row, not a hero block, so we override:
 *   - Val span: font-headline (Cal Sans) at a smaller size, overrides inherited
 *   - StatCard root: lighter padding, border, and shadow via className
 */
const Val = ({ children }: { children: React.ReactNode }) => (
  <span className="font-headline text-[22px] leading-none">{children}</span>
);

const cardClass = "p-3 border-[3px] shadow-flat-sm rounded-[14px]";

export function PortfolioStrip({ stats }: PortfolioStripProps) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      <StatCard
        className={cardClass}
        variant="tomato"
        label="Live Exposure"
        value={<Val>{fmtMoney(stats.liveExposure)}</Val>}
        sub={`${stats.liveCount} lots raising`}
      />
      <StatCard
        className={cardClass}
        variant="sky"
        label="Landing Soon"
        value={
          <Val>
            <UnitWeightText kg={stats.landingKg} maximumFractionDigits={0} />
          </Val>
        }
        sub={`${stats.inMotionCount} in motion`}
      />
      <StatCard
        className={cardClass}
        variant="matcha"
        label="Saved via Tiers"
        value={<Val>{fmtMoney(stats.savedVsBase)}</Val>}
        sub="vs base price"
      />
      <StatCard
        className={cardClass}
        variant="espresso"
        label="YTD Spend"
        value={<Val>{fmtMoney(stats.ytdSpend)}</Val>}
        sub="all settled lots"
      />
    </div>
  );
}
