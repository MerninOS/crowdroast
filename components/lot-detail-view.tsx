"use client";

import React from "react"

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
} from "lucide-react";
import Link from "next/link";
import type { Lot } from "@/lib/types";
import { CommitmentForm } from "@/components/commitment-form";
import { SampleRequestButton } from "@/components/sample-request-button";

export function LotDetailView({
  lot,
  userId,
}: {
  lot: Lot;
  userId: string | null;
}) {
  const commitPercent =
    lot.total_quantity_kg > 0
      ? Math.round((lot.committed_quantity_kg / lot.total_quantity_kg) * 100)
      : 0;

  const remaining = lot.total_quantity_kg - lot.committed_quantity_kg;
  const isOwner = userId === lot.seller_id;
  const canCommit = userId && !isOwner && lot.status === "active" && remaining > 0;

  return (
    <div>
      <Link
        href="/marketplace"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Marketplace
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
                by {lot.seller.company_name || lot.seller.contact_name || "Seller"}
              </p>
            )}
          </div>

          {lot.description && (
            <p className="text-muted-foreground leading-relaxed">
              {lot.description}
            </p>
          )}

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
          {(lot.flavor_notes?.length > 0 || lot.certifications?.length > 0) && (
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
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">
                ${lot.price_per_kg.toFixed(2)}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  / kg
                </span>
              </CardTitle>
              <CardDescription>
                {lot.currency || "USD"} per kilogram
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-muted-foreground">
                    Commitment Progress
                  </span>
                  <span className="font-semibold">{commitPercent}%</span>
                </div>
                <Progress value={commitPercent} className="h-3" />
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {lot.committed_quantity_kg.toLocaleString()} kg committed
                  </span>
                  <span>
                    {lot.total_quantity_kg.toLocaleString()} kg total
                  </span>
                </div>
              </div>

              <Separator />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Remaining</span>
                  <span className="font-medium">
                    {remaining.toLocaleString()} kg
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Min. commitment</span>
                  <span className="font-medium">
                    {lot.min_commitment_kg} kg
                  </span>
                </div>
                {lot.commitment_deadline && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Deadline</span>
                    <span className="font-medium">
                      {new Date(lot.commitment_deadline).toLocaleDateString()}
                    </span>
                  </div>
                )}
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

              {!userId && (
                <Button asChild className="w-full">
                  <Link href="/auth/login">Sign in to commit</Link>
                </Button>
              )}

              {canCommit && (
                <CommitmentForm
                  lotId={lot.id}
                  pricePerKg={lot.price_per_kg}
                  minKg={lot.min_commitment_kg}
                  maxKg={remaining}
                />
              )}

              {userId && !isOwner && (
                <SampleRequestButton lotId={lot.id} userId={userId} />
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
