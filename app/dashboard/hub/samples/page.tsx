"use client";

import React from "react";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FlaskConical } from "lucide-react";
import type { Hub } from "@/lib/types";

const statusStyles: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  shipped: "bg-blue-50 text-blue-700 border-blue-200",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

export default function HubSamplesPage() {
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [selectedHubId, setSelectedHubId] = useState<string>("");
  const [samples, setSamples] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: myHubs } = await supabase
        .from("hubs")
        .select("*")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });

      const hubList = (myHubs || []) as Hub[];
      setHubs(hubList);
      if (hubList.length > 0) {
        setSelectedHubId(hubList[0].id);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!selectedHubId) return;
    const loadSamples = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("sample_requests")
        .select("*, lot:lots!sample_requests_lot_id_fkey(title, origin_country), buyer:profiles!sample_requests_buyer_id_fkey(company_name, contact_name)")
        .eq("hub_id", selectedHubId)
        .order("created_at", { ascending: false });

      setSamples(data || []);
    };
    loadSamples();
  }, [selectedHubId]);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Sample Requests</h1>
          <p className="text-sm text-muted-foreground mt-1">Track sample requests from buyers in your hub.</p>
        </div>
        {hubs.length > 1 && (
          <Select value={selectedHubId} onValueChange={setSelectedHubId}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Select hub" />
            </SelectTrigger>
            <SelectContent>
              {hubs.map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  {h.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {samples.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center py-10 px-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-muted-foreground mb-4">
              <FlaskConical className="h-6 w-6" />
            </div>
            <p className="text-sm text-muted-foreground">No sample requests yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {samples.map((s: any) => (
            <Card key={s.id} className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">{s.lot?.title || "Unknown"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s.buyer?.company_name || s.buyer?.contact_name || "Unknown buyer"}
                    </p>
                  </div>
                  <Badge variant="outline" className={`shrink-0 text-xs ${statusStyles[s.status] || ""}`}>
                    {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                  </Badge>
                </div>
                <div className="mt-3 flex items-center gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Quantity</p>
                    <p className="font-medium text-foreground">{s.quantity_grams}g</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Requested</p>
                    <p className="font-medium text-foreground">
                      {new Date(s.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
