"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, ShoppingCart } from "lucide-react";
import { Input } from "@/components/mernin/Input";
import { Card, CardContent } from "@/components/mernin/Card";
import { Badge } from "@/components/mernin/Badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UnitWeightText, UnitPriceText } from "@/components/unit-value";

export type LotCampaignCard = {
  lotId: string;
  lotTitle: string;
  hubName: string | null;
  statusLabel: "Open / At Risk" | "Open / Guaranteed" | "Successful";
  totalCommittedKg: number;
  currentPricePerKg: number;
  currency: string;
};

type StatusFilter = LotCampaignCard["statusLabel"] | "all";

const statusBadge: Record<
  LotCampaignCard["statusLabel"],
  { variant: "hot" | "fresh" | "outline"; className?: string }
> = {
  "Open / At Risk": { variant: "hot" },
  "Open / Guaranteed": { variant: "outline", className: "bg-sky/20 text-sky border-sky" },
  Successful: { variant: "fresh" },
};

export function SellerCommitmentsClient({ cards }: { cards: LotCampaignCard[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const filtered = cards.filter((card) => {
    if (statusFilter !== "all" && card.statusLabel !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      card.lotTitle.toLowerCase().includes(q) ||
      (card.hubName?.toLowerCase().includes(q) ?? false)
    );
  });

  const hasFilters = search.trim() || statusFilter !== "all";

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-espresso/40" />
          <Input
            placeholder="Search by lot or hub..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="h-10 w-full rounded-[12px] border-3 border-espresso bg-chalk font-body text-sm text-espresso shadow-flat-sm focus:ring-0 focus:ring-offset-0 focus:-translate-x-[1px] focus:-translate-y-[1px] focus:shadow-[4px_4px_0px_theme(colors.tomato)] focus:border-tomato sm:w-48">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="Open / At Risk">Open / At Risk</SelectItem>
            <SelectItem value="Open / Guaranteed">Open / Guaranteed</SelectItem>
            <SelectItem value="Successful">Successful</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center px-4 py-10">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
              <ShoppingCart className="h-6 w-6" />
            </div>
            <p className="text-sm text-muted-foreground">
              {hasFilters ? "No lots match your filters." : "No commitments yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((card) => {
            const badge = statusBadge[card.statusLabel];
            return (
              <Link key={card.lotId} href={`/dashboard/seller/commitments/${card.lotId}`}>
                <Card className="cursor-pointer shadow-sm transition-all duration-150 hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-flat-md mb-2">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">{card.lotTitle}</p>
                        {card.hubName && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{card.hubName}</p>
                        )}
                      </div>
                      <Badge variant={badge.variant} className={`shrink-0 ${badge.className ?? ""}`}>
                        {card.statusLabel}
                      </Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Total Committed</p>
                        <p className="font-semibold text-foreground">
                          <UnitWeightText kg={card.totalCommittedKg} />
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Current Price</p>
                        <p className="font-semibold text-foreground">
                          <UnitPriceText pricePerKg={card.currentPricePerKg} currency={card.currency} />
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
