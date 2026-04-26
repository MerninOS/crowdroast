import { StatCard } from "@merninos/ui";
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

const fmtKg = (kg: number) =>
  kg >= 1000
    ? `${(kg / 1000).toFixed(2).replace(/\.?0+$/, "")} t`
    : `${(kg || 0).toLocaleString()} lb`;

/**
 * 4-card portfolio strip for the buyer commitments page.
 *
 * Math definitions live in `bucket-by-lifecycle.ts:derivePortfolioStats`.
 * This component is presentation only.
 *
 * StatCard's value slot defaults to font-display (Adore Cats) — we override
 * with font-headline (Cal Sans in crowdroast) to keep the page calmer per
 * the buyer's tighter typographic brief on this surface.
 */
const Val = ({ children }: { children: React.ReactNode }) => (
  <span className="font-headline">{children}</span>
);

export function PortfolioStrip({ stats }: PortfolioStripProps) {
  return (
    <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        variant="tomato"
        label="Live Exposure"
        value={<Val>{fmtMoney(stats.liveExposure)}</Val>}
        sub={`${stats.liveCount} lots raising`}
      />
      <StatCard
        variant="sky"
        label="Landing Soon"
        value={<Val>{fmtKg(stats.landingKg)}</Val>}
        sub={`${stats.inMotionCount} in motion`}
      />
      <StatCard
        variant="matcha"
        label="Saved via Tiers"
        value={<Val>{fmtMoney(stats.savedVsBase)}</Val>}
        sub="vs base price"
      />
      <StatCard
        variant="espresso"
        label="YTD Spend"
        value={<Val>{fmtMoney(stats.ytdSpend)}</Val>}
        sub="all settled lots"
      />
    </div>
  );
}
