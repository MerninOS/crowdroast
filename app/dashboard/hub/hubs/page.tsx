"use client";

import React from "react";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/mernin/Card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Warehouse } from "lucide-react";
import type { Hub } from "@/lib/types";
import { useUnitPreference } from "@/components/unit-provider";
import { formatUnitWeight } from "@/lib/units";

export default function HubManagementPage() {
  const { unit } = useUnitPreference();
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [isPageLoading, setIsPageLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("hubs")
        .select("*")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });

      setHubs((data as Hub[]) || []);
      setIsPageLoading(false);
    };
    load();
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">My Hubs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Hub assignment is managed by an admin.
        </p>
      </div>

      {isPageLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, idx) => (
            <Card key={`hub-skeleton-${idx}`}>
              <CardHeader>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-28" />
              </CardHeader>
              <CardContent>
                <Skeleton className="mb-2 h-4 w-24" />
                <Skeleton className="h-2 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : hubs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12">
            <Warehouse className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <p className="text-muted-foreground">No hub assigned yet. Contact an admin.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {hubs.map((hub) => {
            const pct =
              hub.capacity_kg > 0
                ? Math.round((hub.used_capacity_kg / hub.capacity_kg) * 100)
                : 0;

            return (
              <Card key={hub.id}>
                <CardHeader>
                  <CardTitle className="text-base">{hub.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {[hub.city, hub.state, hub.country].filter(Boolean).join(", ") || "No location set"}
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Capacity</span>
                    <span className="font-medium">
                      {formatUnitWeight(hub.used_capacity_kg, unit)} / {formatUnitWeight(hub.capacity_kg, unit)} {unit}
                    </span>
                  </div>
                  <Progress value={pct} className="h-2" />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
