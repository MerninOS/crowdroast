"use client";

import React from "react";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@merninos/ui";
import { Button } from "@merninos/ui";
import { Badge } from "@merninos/ui";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Check, Coffee, X, Star } from "lucide-react";
import Link from "next/link";
import type { Hub, Lot } from "@/lib/types";
import { useUnitPreference } from "@/components/unit-provider";
import { formatUnitPrice, formatUnitWeight } from "@/lib/units";
import { addPlatformFee } from "@/lib/pricing";

export default function HubCatalogPage() {
  const { unit } = useUnitPreference();
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [isHubsLoading, setIsHubsLoading] = useState(true);
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  const [selectedHubId, setSelectedHubId] = useState<string>("");
  const [allLots, setAllLots] = useState<Lot[]>([]);
  const [hubLotIds, setHubLotIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<string | null>(null);
  const [campaignByLotId, setCampaignByLotId] = useState<Map<string, any>>(new Map());

  // Featured lot state
  const [featuredLotId, setFeaturedLotId] = useState<string | null>(null);
  const [featureDialogOpen, setFeatureDialogOpen] = useState(false);
  const [pendingFeatureLotId, setPendingFeatureLotId] = useState<string | null>(null);
  const [pendingFeatureLotTitle, setPendingFeatureLotTitle] = useState<string>("");
  const [currentFeaturedLotTitle, setCurrentFeaturedLotTitle] = useState<string>("");
  const [featureLoading, setFeatureLoading] = useState(false);

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
        setFeaturedLotId(hubList[0].featured_lot_id ?? null);
      }
      setIsHubsLoading(false);
    };
    load();
  }, []);

  // Sync featuredLotId when selected hub changes
  useEffect(() => {
    const hub = hubs.find((h) => h.id === selectedHubId);
    setFeaturedLotId(hub?.featured_lot_id ?? null);
  }, [selectedHubId, hubs]);

  useEffect(() => {
    if (!selectedHubId) return;
    const loadCatalog = async () => {
      setIsCatalogLoading(true);
      const supabase = createClient();

      const { data: lots } = await supabase
        .from("lots")
        .select("*, seller:profiles!lots_seller_id_fkey(company_name, contact_name)")
        .in("status", ["active", "fully_committed"])
        .order("created_at", { ascending: false });

      setAllLots((lots as unknown as Lot[]) || []);

      const { data: existingHubLots } = await supabase
        .from("hub_lots")
        .select("lot_id")
        .eq("hub_id", selectedHubId);

      setHubLotIds(new Set((existingHubLots || []).map((hl: { lot_id: string }) => hl.lot_id)));

      const { data: activeCampaigns } = await supabase
        .from("campaigns")
        .select("lot_id, hub_id, deadline, status")
        .eq("status", "active");

      setCampaignByLotId(new Map(
        (activeCampaigns || []).map((c: any) => [c.lot_id, c])
      ));

      setIsCatalogLoading(false);
    };
    loadCatalog();
  }, [selectedHubId]);

  const toggleLot = async (lotId: string, add: boolean) => {
    setLoading(lotId);

    const res = await fetch("/api/hub-lots", {
      method: add ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hub_id: selectedHubId, lot_id: lotId }),
    });

    if (!res.ok) {
      const result = await res.json();
      toast.error(result.error || "Something went wrong");
    } else if (add) {
      setHubLotIds((prev) => new Set([...prev, lotId]));
      toast.success("Lot added to hub catalog");
    } else {
      setHubLotIds((prev) => {
        const next = new Set(prev);
        next.delete(lotId);
        return next;
      });
      toast.success("Lot removed from hub catalog");
    }
    setLoading(null);
  };

  const openFeatureDialog = (lotId: string, lotTitle: string) => {
    setPendingFeatureLotId(lotId);
    setPendingFeatureLotTitle(lotTitle);
    if (featuredLotId) {
      const currentLot = allLots.find((l) => l.id === featuredLotId);
      setCurrentFeaturedLotTitle(currentLot?.title ?? "the current lot");
    } else {
      setCurrentFeaturedLotTitle("");
    }
    setFeatureDialogOpen(true);
  };

  const confirmFeatureLot = async () => {
    if (!pendingFeatureLotId || !selectedHubId) return;
    setFeatureLoading(true);

    const res = await fetch(`/api/hubs/${selectedHubId}/featured-lot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lot_id: pendingFeatureLotId }),
    });

    if (!res.ok) {
      const result = await res.json();
      toast.error(result.error || "Something went sideways");
    } else {
      setFeaturedLotId(pendingFeatureLotId);
      setHubs((prev) =>
        prev.map((h) =>
          h.id === selectedHubId ? { ...h, featured_lot_id: pendingFeatureLotId } : h
        )
      );
      toast.success("Featured roast updated. Your buyers will see it next time they load their dashboard.");
    }

    setFeatureLoading(false);
    setFeatureDialogOpen(false);
    setPendingFeatureLotId(null);
  };

  const selectedHub = hubs.find((h) => h.id === selectedHubId);

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Hub Catalog</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse seller offerings and curate which lots to show in your hub.
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

      {selectedHub && (
        <div className="mb-6 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Curating for: <span className="font-medium text-foreground">{selectedHub.name}</span>
          {" "}&middot;{" "}
          {hubLotIds.size} lot{hubLotIds.size !== 1 ? "s" : ""} in catalog
          {featuredLotId && (
            <>
              {" "}&middot;{" "}
              <span className="font-medium text-foreground">
                1 featured roast active
              </span>
            </>
          )}
        </div>
      )}

      {isHubsLoading || (selectedHubId && isCatalogLoading) ? (
        <div className="space-y-4">
          <div className="rounded-lg border p-4">
            <Skeleton className="h-4 w-56" />
          </div>
          {Array.from({ length: 4 }).map((_, idx) => (
            <Card key={`catalog-skeleton-${idx}`} className="shadow-sm">
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-8 w-28" />
              </CardHeader>
              <CardContent>
                <Skeleton className="mb-2 h-4 w-44" />
                <Skeleton className="h-2 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : hubs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12">
            <Coffee className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">Create a hub first to start curating lots.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {(() => {
            const availableLots = allLots.filter((lot) => {
              const campaign = campaignByLotId.get(lot.id);
              return !campaign || campaign.hub_id === selectedHubId;
            });

            if (availableLots.length === 0) {
              const allClaimed = allLots.length > 0;
              return (
                <Card>
                  <CardContent className="flex flex-col items-center py-12 text-center">
                    <Coffee className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="font-medium text-foreground mb-1">
                      {allClaimed ? "All lots are currently claimed." : "Nothing to claim right now."}
                    </p>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      {allClaimed
                        ? "Every available lot has an active campaign at another hub. Check back when campaigns wrap up or new lots are listed."
                        : "Sellers haven't listed any lots yet. Keep an eye out — new lots get added regularly."}
                    </p>
                  </CardContent>
                </Card>
              );
            }

            return availableLots.map((lot) => {
              const inHub = hubLotIds.has(lot.id);
              const campaign = campaignByLotId.get(lot.id);
              const hasCampaignByThisHub = campaign && campaign.hub_id === selectedHubId;
              const isFeatured = lot.id === featuredLotId;
              const isEligibleToFeature = inHub && hasCampaignByThisHub;
              const pct =
                lot.total_quantity_kg > 0
                  ? Math.round((lot.committed_quantity_kg / lot.total_quantity_kg) * 100)
                  : 0;
              const seller = lot.seller as unknown as { company_name: string | null; contact_name: string | null } | null;

              return (
                <Card
                  key={lot.id}
                  className={`shadow-sm ${inHub ? "border-emerald-200 bg-emerald-50/40" : ""} ${isFeatured ? "ring-2 ring-amber-400 border-amber-300" : ""}`}
                >
                  <div className="overflow-hidden rounded-t-lg border-b bg-muted/30">
                    <img
                      src={lot.images?.[0] || "/placeholder.jpg"}
                      alt={lot.title}
                      className="h-40 w-full object-cover"
                    />
                  </div>
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <Link href={`/dashboard/hub/catalog/${lot.id}?hub=${selectedHubId}`} className="hover:underline">
                        <CardTitle className="text-base">{lot.title}</CardTitle>
                      </Link>
                      <p className="text-sm text-muted-foreground mt-1">
                        {lot.origin_country}
                        {lot.region ? `, ${lot.region}` : ""} &middot;{" "}
                        {formatUnitPrice(addPlatformFee(lot.price_per_kg), unit, lot.currency || "USD")}/{unit}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Seller: {seller?.company_name || seller?.contact_name || "Unknown"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 justify-end">
                      {isFeatured && (
                        <span
                          style={{
                            fontFamily: "'Cal Sans', system-ui, sans-serif",
                            fontSize: 10,
                            fontWeight: 800,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            padding: "3px 10px",
                            border: "2px solid #1C0F05",
                            borderRadius: 9999,
                            background: "#F5C842",
                            color: "#1C0F05",
                            boxShadow: "2px 2px 0 #1C0F05",
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Star className="h-3 w-3" style={{ fill: "#1C0F05" }} />
                          Featured
                        </span>
                      )}
                      {hasCampaignByThisHub ? (
                        <>
                          <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">
                            Campaign Active — ends {new Date(campaign.deadline).toLocaleDateString()}
                          </Badge>
                          {isEligibleToFeature && !isFeatured && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-amber-300 text-amber-700 hover:bg-amber-50"
                              onClick={() => openFeatureDialog(lot.id, lot.title)}
                            >
                              <Star className="mr-1 h-3 w-3" />
                              Feature this lot
                            </Button>
                          )}
                        </>
                      ) : inHub ? (
                        <>
                          <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">In Catalog</Badge>
                          <Link href={`/dashboard/hub/campaigns?lot=${lot.id}&hub=${selectedHubId}`}>
                            <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700">
                              Start Campaign
                            </Button>
                          </Link>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                            disabled={loading === lot.id}
                            onClick={() => toggleLot(lot.id, false)}
                          >
                            {loading === lot.id ? "..." : <><X className="mr-1 h-3 w-3" />Remove</>}
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          className="bg-emerald-600 text-white hover:bg-emerald-700"
                          disabled={loading === lot.id}
                          onClick={() => toggleLot(lot.id, true)}
                        >
                          {loading === lot.id ? "..." : <><Plus className="mr-1 h-3 w-3" />Add to Hub</>}
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-muted-foreground">
                            {formatUnitWeight(lot.committed_quantity_kg, unit)} / {formatUnitWeight(lot.total_quantity_kg, unit)} {unit} committed
                          </span>
                          <span className="font-medium">{pct}%</span>
                        </div>
                        <Progress value={pct} className="h-2 bg-emerald-100" indicatorClassName="bg-emerald-600" />
                      </div>
                      {lot.score && (
                        <Badge variant="secondary" className="shrink-0">
                          {lot.score} pts
                        </Badge>
                      )}
                    </div>
                    {lot.flavor_notes && lot.flavor_notes.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {lot.flavor_notes.map((note) => (
                          <Badge key={note} variant="outline" className="text-xs">
                            {note}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            });
          })()}
        </div>
      )}

      {/* Feature this lot confirmation dialog */}
      <AlertDialog open={featureDialogOpen} onOpenChange={setFeatureDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {currentFeaturedLotTitle
                ? "Replace your featured roast?"
                : "Set as featured roast?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {currentFeaturedLotTitle
                ? `This will replace "${currentFeaturedLotTitle}" as your featured roast. "${pendingFeatureLotTitle}" will appear at the top of your buyers' dashboard.`
                : `"${pendingFeatureLotTitle}" will appear as the featured roast at the top of your buyers' dashboard.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={featureLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmFeatureLot} disabled={featureLoading}>
              {featureLoading ? "Updating..." : "Set as Featured"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
