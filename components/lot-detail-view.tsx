"use client";

import React, { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  MapPin,
  Mountain,
  Star,
  Calendar,
  Leaf,
  FlaskConical,
  ArrowLeft,
  Package,
  Clock,
  Users,
  TrendingDown,
  Check,
} from "lucide-react";
import Link from "next/link";
import type { Lot, PricingTier, Commitment, UserRole } from "@/lib/types";
import { CommitmentForm } from "@/components/commitment-form";
import { SampleRequestButton } from "@/components/sample-request-button";
import { useUnitPreference } from "@/components/unit-provider";
import { formatUnitPrice, formatUnitWeight } from "@/lib/units";
import { addPlatformFee } from "@/lib/pricing";

interface LotDetailProps {
  lot: Lot;
  userId: string | null;
  viewerRole?: UserRole | null;
  hubId?: string | null;
  hasRequestedSample?: boolean;
  defaultDeliveryDetails?: {
    address?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
  } | null;
  pricingTiers?: PricingTier[];
  commitments?: Commitment[];
  backHref?: string;
  backLabel?: string;
}

export function LotDetailView({
  lot,
  userId,
  viewerRole,
  hubId,
  hasRequestedSample = false,
  defaultDeliveryDetails,
  pricingTiers = [],
  commitments = [],
  backHref,
  backLabel,
}: LotDetailProps) {
  const { unit } = useUnitPreference();
  const sortedTiers = [...pricingTiers].sort(
    (a, b) => a.min_quantity_kg - b.min_quantity_kg
  );

  // Build full tier list: base + discount tiers
  const allTiers = [
    {
      min_quantity_kg: lot.min_commitment_kg,
      price_per_kg: lot.price_per_kg,
      label: "Minimum (trigger)",
    },
    ...sortedTiers.map((t) => ({
      min_quantity_kg: t.min_quantity_kg,
      price_per_kg: t.price_per_kg,
      label: `${formatUnitWeight(t.min_quantity_kg, unit)} ${unit}`,
    })),
  ];

  // Current active price based on committed quantity
  const getActivePrice = (committedQty: number) => {
    let price = lot.price_per_kg;
    for (const tier of [...sortedTiers].reverse()) {
      if (committedQty >= tier.min_quantity_kg) {
        price = tier.price_per_kg;
        break;
      }
    }
    return price;
  };

  const activePrice = getActivePrice(lot.committed_quantity_kg);
  const nextTier = sortedTiers.find(
    (t) => t.min_quantity_kg > lot.committed_quantity_kg
  );

  const triggerPercent =
    lot.min_commitment_kg > 0
      ? Math.min(
          100,
          Math.round(
            (lot.committed_quantity_kg / lot.min_commitment_kg) * 100
          )
        )
      : 0;
  const capacityPercent =
    lot.total_quantity_kg > 0
      ? Math.round((lot.committed_quantity_kg / lot.total_quantity_kg) * 100)
      : 0;

  const isTriggered = lot.committed_quantity_kg >= lot.min_commitment_kg;
  const remaining = lot.total_quantity_kg - lot.committed_quantity_kg;
  const isOwner = userId === lot.seller_id;
  const canCommit =
    userId &&
    !isOwner &&
    viewerRole === "buyer" &&
    lot.status === "active" &&
    remaining > 0;

  return (
    <div>
      <Link
        href={backHref || (hubId ? "/dashboard/buyer" : "/marketplace")}
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {backLabel || (hubId ? "Back to Browse" : "Back to Marketplace")}
      </Link>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-6">
          <div>
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-2xl font-bold text-foreground lg:text-3xl text-balance">
                {lot.title}
              </h1>
              {lot.score && (
                <Badge className="shrink-0 gap-1 bg-primary/10 text-primary text-base px-3 py-1">
                  <Star className="h-4 w-4" />
                  {lot.score}
                </Badge>
              )}
            </div>
            {lot.seller && (
              <p className="mt-1 text-sm text-muted-foreground">
                by{" "}
                {lot.seller.company_name ||
                  lot.seller.contact_name ||
                  "Seller"}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl border bg-muted/20">
              <img
                src={lot.images?.[0] || "/placeholder.jpg"}
                alt={lot.title}
                className="h-72 w-full object-cover"
              />
            </div>
            {lot.images && lot.images.length > 1 && (
              <div className="grid gap-3 sm:grid-cols-3">
                {lot.images.slice(1, 4).map((url, idx) => (
                  <div key={`${url}-${idx}`} className="overflow-hidden rounded-lg border bg-muted/20">
                    <img
                      src={url}
                      alt={`${lot.title} supporting image ${idx + 1}`}
                      className="h-28 w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {lot.description && (
            <p className="text-muted-foreground leading-relaxed">
              {lot.description}
            </p>
          )}

          {/* Pricing Tiers Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingDown className="h-4 w-4" />
                Volume Pricing Tiers
              </CardTitle>
              <CardDescription>
                The more buyers commit, the lower the price for everyone.
                {nextTier && (
                  <>
                    {" "}
                    Only{" "}
                    <span className="font-semibold text-foreground">
                      {formatUnitWeight(
                        nextTier.min_quantity_kg - lot.committed_quantity_kg,
                        unit
                      )}{" "}
                      {unit}
                    </span>{" "}
                    more needed to unlock{" "}
                    {formatUnitPrice(addPlatformFee(nextTier.price_per_kg), unit, lot.currency || "USD")}/{unit}!
                  </>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {allTiers.map((tier, idx) => {
                  const isActive =
                    tier.price_per_kg === activePrice &&
                    lot.committed_quantity_kg >= tier.min_quantity_kg;
                  const isReached =
                    lot.committed_quantity_kg >= tier.min_quantity_kg;
                  const isNext =
                    !isReached &&
                    (idx === 0 ||
                      lot.committed_quantity_kg >=
                        allTiers[idx - 1].min_quantity_kg);
                  const savings =
                    idx > 0
                      ? (
                          ((lot.price_per_kg - tier.price_per_kg) /
                            lot.price_per_kg) *
                          100
                        ).toFixed(0)
                      : null;

                  return (
                    <div
                      key={idx}
                      className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                        isActive
                          ? "border-primary bg-primary/5"
                          : isReached
                            ? "border-border bg-muted/30"
                            : isNext
                              ? "border-dashed border-primary/40"
                              : "border-border"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                            isReached
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {isReached ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            idx + 1
                          )}
                        </div>
                        <div>
                          <p
                            className={`text-sm font-medium ${isActive ? "text-primary" : "text-foreground"}`}
                          >
                            {formatUnitWeight(tier.min_quantity_kg, unit)} {unit}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {tier.label}
                            {savings && (
                              <span className="ml-1 text-primary font-medium">
                                ({savings}% off)
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <p
                        className={`text-lg font-bold ${isActive ? "text-primary" : "text-foreground"}`}
                      >
                        {formatUnitPrice(addPlatformFee(tier.price_per_kg), unit, lot.currency || "USD")}
                        <span className="text-xs font-normal text-muted-foreground">
                          /{unit}
                        </span>
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Tier progress visualization */}
              {sortedTiers.length > 0 && (
                <div className="mt-4">
                  <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all"
                      style={{ width: `${capacityPercent}%` }}
                    />
                    {/* Tier markers */}
                    {sortedTiers.map((tier) => {
                      const markerPct =
                        (tier.min_quantity_kg / lot.total_quantity_kg) * 100;
                      return (
                        <div
                          key={tier.id}
                          className="absolute top-0 h-full w-0.5 bg-foreground/30"
                          style={{ left: `${markerPct}%` }}
                        />
                      );
                    })}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>0 {unit}</span>
                    <span>{formatUnitWeight(lot.total_quantity_kg, unit)} {unit}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Details grid */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lot Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                <DetailRow
                  icon={<MapPin className="h-4 w-4" />}
                  label="Origin"
                  value={`${lot.origin_country}${lot.region ? `, ${lot.region}` : ""}`}
                />
                {lot.farm && (
                  <DetailRow
                    icon={<Leaf className="h-4 w-4" />}
                    label="Farm"
                    value={lot.farm}
                  />
                )}
                {lot.variety && (
                  <DetailRow
                    icon={<FlaskConical className="h-4 w-4" />}
                    label="Variety"
                    value={lot.variety}
                  />
                )}
                {lot.process && (
                  <DetailRow
                    icon={<Package className="h-4 w-4" />}
                    label="Process"
                    value={lot.process}
                  />
                )}
                {(lot.altitude_min || lot.altitude_max) && (
                  <DetailRow
                    icon={<Mountain className="h-4 w-4" />}
                    label="Altitude"
                    value={
                      lot.altitude_min && lot.altitude_max
                        ? `${lot.altitude_min} - ${lot.altitude_max} masl`
                        : `${lot.altitude_min || lot.altitude_max} masl`
                    }
                  />
                )}
                {lot.crop_year && (
                  <DetailRow
                    icon={<Calendar className="h-4 w-4" />}
                    label="Crop Year"
                    value={lot.crop_year}
                  />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Flavor notes and certs */}
          {(lot.flavor_notes?.length > 0 ||
            lot.certifications?.length > 0) && (
            <Card>
              <CardContent className="pt-6">
                {lot.flavor_notes?.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm font-medium text-foreground mb-2">
                      Flavor Notes
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {lot.flavor_notes.map((note) => (
                        <Badge key={note} variant="secondary">
                          {note}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {lot.certifications?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-foreground mb-2">
                      Certifications
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {lot.certifications.map((cert) => (
                        <Badge key={cert} variant="outline">
                          {cert}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Backers List */}
          {commitments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4" />
                  Backers ({commitments.length})
                </CardTitle>
                <CardDescription>
                  People who have committed to this lot.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {commitments.map((c, idx) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-lg bg-muted/30 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
                          {c.buyer?.company_name?.[0] ||
                            c.buyer?.contact_name?.[0] ||
                            `#${idx + 1}`}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {c.buyer?.company_name ||
                              c.buyer?.contact_name ||
                              "Anonymous Buyer"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(c.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-foreground">
                          {formatUnitWeight(c.quantity_kg, unit)} {unit}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Price + Countdown */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl">
                    {formatUnitPrice(addPlatformFee(activePrice), unit, lot.currency || "USD")}
                    <span className="text-sm font-normal text-muted-foreground">
                      / {unit}
                    </span>
                  </CardTitle>
                  <CardDescription>
                    {sortedTiers.length > 0
                      ? "Current buyer price, including the 10% platform fee"
                      : `${lot.currency || "USD"} per ${unit}, including the 10% platform fee`}
                  </CardDescription>
                </div>
                {lot.price_per_kg !== activePrice && (
                  <Badge variant="secondary" className="text-xs line-through opacity-60">
                    {formatUnitPrice(addPlatformFee(lot.price_per_kg), unit, lot.currency || "USD")}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Countdown timer */}
              {lot.commitment_deadline && (
                <CountdownTimer deadline={lot.commitment_deadline} />
              )}

              {/* Progress toward minimum trigger */}
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-muted-foreground">
                    {isTriggered ? "Sale Triggered" : "Toward Minimum"}
                  </span>
                  <span className="font-semibold">
                    {isTriggered ? "Reached" : `${triggerPercent}%`}
                  </span>
                </div>
                <Progress
                  value={triggerPercent}
                  className={`h-3 ${isTriggered ? "[&>div]:bg-accent" : ""}`}
                />
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {formatUnitWeight(lot.committed_quantity_kg, unit)} {unit} committed
                  </span>
                  <span>
                    {formatUnitWeight(lot.min_commitment_kg, unit)} {unit} needed
                  </span>
                </div>
              </div>

              {!isTriggered && (
                <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                  This sale only triggers if{" "}
                  {formatUnitWeight(lot.min_commitment_kg, unit)} {unit} total is committed
                  by the deadline. Still need{" "}
                  <span className="font-semibold text-foreground">
                    {formatUnitWeight(
                      lot.min_commitment_kg - lot.committed_quantity_kg,
                      unit
                    )}{" "}
                    {unit}
                  </span>{" "}
                  more.
                </p>
              )}

              {isTriggered && (
                <p className="text-xs bg-accent/10 text-accent-foreground rounded-lg p-3 font-medium">
                  Minimum reached! This sale is confirmed. Keep committing to
                  unlock lower pricing tiers.
                </p>
              )}

              <Separator />

              {/* Capacity progress */}
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-muted-foreground">
                    Total Capacity
                  </span>
                  <span className="font-semibold">{capacityPercent}%</span>
                </div>
                <Progress value={capacityPercent} className="h-2" />
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {formatUnitWeight(remaining, unit)} {unit} remaining
                  </span>
                  <span>
                    {formatUnitWeight(lot.total_quantity_kg, unit)} {unit} max
                  </span>
                </div>
              </div>

              <Separator />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Backers</span>
                  <span className="font-medium">{commitments.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge
                    variant={
                      lot.status === "active" ? "default" : "secondary"
                    }
                    className={
                      lot.status === "active"
                        ? "bg-accent text-accent-foreground"
                        : ""
                    }
                  >
                    {lot.status === "fully_committed"
                      ? "Fully Committed"
                      : lot.status.charAt(0).toUpperCase() +
                        lot.status.slice(1)}
                  </Badge>
                </div>
              </div>

              <Separator />

              <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                Buyer pricing includes a 10% platform fee. Sellers still receive the full base price they set for the lot.
              </p>

              <Separator />

              {!userId && (
                <Button asChild className="w-full bg-tomato text-cream border-3 border-espresso rounded-full font-body font-bold uppercase tracking-widest shadow-flat-sm hover:shadow-flat-md transition-all">
                  <Link href="/auth/sign-up">Request access to this hub to commit</Link>
                </Button>
              )}

              {canCommit && (
                <CommitmentForm
                  lotId={lot.id}
                  activePrice={activePrice}
                  maxKg={remaining}
                  hubId={hubId || undefined}
                />
              )}

              {userId && !isOwner && viewerRole === "hub_owner" && (
                <SampleRequestButton
                  lotId={lot.id}
                  hubId={hubId || undefined}
                  hasRequested={hasRequestedSample}
                  defaultDeliveryDetails={defaultDeliveryDetails}
                />
              )}

              {isOwner && (
                <p className="text-center text-sm text-muted-foreground">
                  This is your lot.
                </p>
              )}
            </CardContent>
          </Card>

          {lot.hub && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Distribution Hub</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground">{lot.hub.name}</p>
                <p>
                  {[lot.hub.city, lot.hub.state, lot.hub.country]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function CountdownTimer({ deadline }: { deadline: string }) {
  const [timeLeft, setTimeLeft] = useState(() =>
    getTimeRemaining(new Date(deadline))
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(getTimeRemaining(new Date(deadline)));
    }, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  const isExpired = timeLeft.total <= 0;

  return (
    <div
      className={`rounded-lg p-4 ${isExpired ? "bg-destructive/10" : "bg-muted/50"}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">
          {isExpired ? "Deadline Passed" : "Time Remaining"}
        </span>
      </div>
      {isExpired ? (
        <p className="text-sm text-destructive font-medium">
          The commitment period has ended.
        </p>
      ) : (
        <div className="grid grid-cols-4 gap-2 text-center">
          <TimeBlock value={timeLeft.days} label="Days" />
          <TimeBlock value={timeLeft.hours} label="Hrs" />
          <TimeBlock value={timeLeft.minutes} label="Min" />
          <TimeBlock value={timeLeft.seconds} label="Sec" />
        </div>
      )}
    </div>
  );
}

function TimeBlock({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="text-xl font-bold font-mono text-foreground">
        {String(value).padStart(2, "0")}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function getTimeRemaining(deadline: Date) {
  const total = deadline.getTime() - Date.now();
  if (total <= 0) return { total: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
  return {
    total,
    days: Math.floor(total / (1000 * 60 * 60 * 24)),
    hours: Math.floor((total / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((total / (1000 * 60)) % 60),
    seconds: Math.floor((total / 1000) % 60),
  };
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div>
        <p className="text-muted-foreground">{label}</p>
        <p className="font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}
