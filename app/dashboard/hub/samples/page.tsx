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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FlaskConical } from "lucide-react";
import type { Hub } from "@/lib/types";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-accent/20 text-accent-foreground",
  shipped: "bg-blue-100 text-blue-800",
  delivered: "bg-accent text-accent-foreground",
  rejected: "bg-destructive/10 text-destructive",
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sample Requests</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track sample requests from buyers in your hub.
          </p>
        </div>
        {hubs.length > 1 && (
          <Select value={selectedHubId} onValueChange={setSelectedHubId}>
            <SelectTrigger className="w-[200px]">
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
        <Card>
          <CardContent className="flex flex-col items-center py-12">
            <FlaskConical className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No sample requests yet.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lot</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead className="text-right">Qty (g)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {samples.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <p className="font-medium">{s.lot?.title || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">{s.lot?.origin_country}</p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.buyer?.company_name || s.buyer?.contact_name || "Unknown"}
                    </TableCell>
                    <TableCell className="text-right">{s.quantity_grams}</TableCell>
                    <TableCell>
                      <Badge className={statusColors[s.status] || ""} variant="secondary">
                        {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(s.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
