"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { MapPin, Mountain, Star } from "lucide-react";
import type { Lot } from "@/lib/types";
import { useUnitPreference } from "@/components/unit-provider";
import { formatUnitPrice, formatUnitWeight } from "@/lib/units";

export function LotCard({ lot }: { lot: Lot }) {
  const { unit } = useUnitPreference();
  const commitPercent =
    lot.total_quantity_kg > 0
      ? Math.round((lot.committed_quantity_kg / lot.total_quantity_kg) * 100)
      : 0;

  const remaining = lot.total_quantity_kg - lot.committed_quantity_kg;

  return (
    <Link href={`/marketplace/${lot.id}`}>
      <Card className="group h-full overflow-hidden transition-shadow hover:shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-semibold leading-tight text-foreground group-hover:text-primary transition-colors line-clamp-2">
              {lot.title}
            </h3>
            {lot.score && (
              <Badge
                variant="secondary"
                className="shrink-0 gap-1 bg-primary/10 text-primary"
              >
                <Star className="h-3 w-3" />
                {lot.score}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {lot.origin_country}
              {lot.region ? `, ${lot.region}` : ""}
            </span>
            {(lot.altitude_min || lot.altitude_max) && (
              <span className="flex items-center gap-1">
                <Mountain className="h-3 w-3" />
                {lot.altitude_min && lot.altitude_max
                  ? `${lot.altitude_min}-${lot.altitude_max}m`
                  : `${lot.altitude_min || lot.altitude_max}m`}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="pb-3">
          <div className="flex flex-wrap gap-1.5 mb-3">
            {lot.variety && (
              <Badge variant="outline" className="text-xs">
                {lot.variety}
              </Badge>
            )}
            {lot.process && (
              <Badge variant="outline" className="text-xs">
                {lot.process}
              </Badge>
            )}
            {lot.flavor_notes?.slice(0, 3).map((note) => (
              <Badge
                key={note}
                variant="secondary"
                className="text-xs"
              >
                {note}
              </Badge>
            ))}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Committed</span>
              <span className="font-medium">{commitPercent}%</span>
            </div>
            <Progress value={commitPercent} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {formatUnitWeight(remaining, unit)} {unit} remaining of{" "}
              {formatUnitWeight(lot.total_quantity_kg, unit)} {unit}
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex items-center justify-between border-t bg-muted/30 px-6 py-3">
          <div>
            <p className="text-lg font-bold text-foreground">
              {formatUnitPrice(lot.price_per_kg, unit, lot.currency || "USD")}
              <span className="text-xs font-normal text-muted-foreground">
                /{unit}
              </span>
            </p>
          </div>
          <Badge
            variant={lot.status === "active" ? "default" : "secondary"}
            className={
              lot.status === "active"
                ? "bg-accent text-accent-foreground"
                : ""
            }
          >
            {lot.status === "fully_committed"
              ? "Fully Committed"
              : lot.status.charAt(0).toUpperCase() + lot.status.slice(1)}
          </Badge>
        </CardFooter>
      </Card>
    </Link>
  );
}
