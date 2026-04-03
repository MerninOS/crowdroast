"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/mernin/Card";
import { Button } from "@/components/mernin/Button";
import { Badge } from "@/components/mernin/Badge";
import { Input } from "@/components/mernin/Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { MapPin, Search, Warehouse, Clock } from "lucide-react";
import type { Hub, HubAccessRequest } from "@/lib/types";

type BrowseHub = Pick<Hub, "id" | "name" | "address" | "city" | "state" | "country">;

export default function FindHubPage() {
  const [hubs, setHubs] = useState<BrowseHub[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [pendingRequest, setPendingRequest] = useState<HubAccessRequest | null>(null);
  const [activeMembership, setActiveMembership] = useState(false);
  const [requestingHubId, setRequestingHubId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const [hubsRes, requestsRes] = await Promise.all([
        fetch("/api/hubs"),
        fetch("/api/hub-access-requests"),
      ]);

      if (hubsRes.ok) {
        setHubs(await hubsRes.json());
      }

      if (requestsRes.ok) {
        const requests: HubAccessRequest[] = await requestsRes.json();
        const pending = requests.find((r) => r.status === "pending") || null;
        setPendingRequest(pending);
      }

      // Check if buyer is already in a hub
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: membership } = await supabase
          .from("hub_members")
          .select("id")
          .eq("user_id", user.id)
          .eq("status", "active")
          .maybeSingle();
        setActiveMembership(!!membership);
      }

      setIsLoading(false);
    };
    load();
  }, []);

  const handleRequest = async (hubId: string) => {
    setRequestingHubId(hubId);
    const res = await fetch("/api/hub-access-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hub_id: hubId }),
    });

    const result = await res.json();

    if (!res.ok) {
      toast.error(result.error || "Something went sideways");
    } else {
      setPendingRequest(result);
      toast.success("Request sent. The hub owner will be notified.");
    }
    setRequestingHubId(null);
  };

  // Derive unique states from hub data
  const states = Array.from(
    new Set(hubs.map((h) => h.state).filter(Boolean))
  ).sort() as string[];

  const filtered = hubs.filter((h) => {
    const matchesSearch =
      !search ||
      h.name.toLowerCase().includes(search.toLowerCase()) ||
      (h.city && h.city.toLowerCase().includes(search.toLowerCase()));
    const matchesState = stateFilter === "all" || h.state === stateFilter;
    return matchesSearch && matchesState;
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-3xl tracking-tight text-espresso">
          Find a Hub
        </h1>
        <p className="mt-1 font-body text-sm text-espresso/60">
          Browse available hubs and request access to start committing to lots.
        </p>
      </div>

      {pendingRequest && (
        <div className="mb-6 rounded-[12px] border-3 border-espresso bg-sun/20 px-4 py-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-espresso" />
            <p className="font-body text-sm font-bold text-espresso">
              Pending request for{" "}
              {(pendingRequest as any).hub?.name || "a hub"}
            </p>
            <Badge variant="hot">Pending</Badge>
          </div>
          <p className="mt-1 font-body text-xs text-espresso/60">
            The hub owner has been notified. You'll get an email when they respond.
          </p>
        </div>
      )}

      {activeMembership && (
        <div className="mb-6 rounded-[12px] border-3 border-espresso bg-matcha/20 px-4 py-3">
          <p className="font-body text-sm font-bold text-espresso">
            You're already a member of a hub.
          </p>
          <p className="mt-1 font-body text-xs text-espresso/60">
            Leave your current hub before requesting a new one.
          </p>
        </div>
      )}

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-espresso/40" />
          <Input
            placeholder="Search by name or city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger className="w-full sm:w-[200px] rounded-[12px] border-3 border-espresso bg-chalk font-body text-sm shadow-flat-sm">
            <SelectValue placeholder="All states" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            {states.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={`skeleton-${i}`}>
              <CardContent className="p-6">
                <Skeleton className="mb-3 h-6 w-3/4" />
                <Skeleton className="mb-2 h-4 w-full" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="mt-4 h-10 w-full rounded-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12">
            <Warehouse className="mb-4 h-12 w-12 text-espresso/30" />
            <p className="font-headline text-lg text-espresso">
              {hubs.length === 0 ? "No hubs available yet" : "No hubs match your search"}
            </p>
            <p className="mt-2 max-w-sm text-center font-body text-sm text-espresso/60">
              {hubs.length === 0
                ? "Check back soon — new hubs are being added."
                : "Try a different search or clear your filters."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((hub) => {
            const isPending = pendingRequest?.hub_id === hub.id;
            const isDisabled =
              activeMembership || !!pendingRequest || requestingHubId === hub.id;

            const address = [hub.address, hub.city, hub.state]
              .filter(Boolean)
              .join(", ");

            return (
              <Card
                key={hub.id}
                className="flex flex-col hover:-translate-x-[3px] hover:-translate-y-[3px] hover:shadow-flat-lg"
              >
                <CardHeader>
                  <CardTitle className="text-xl">{hub.name}</CardTitle>
                  {address && (
                    <div className="mt-2 flex items-start gap-1.5">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-espresso/50" />
                      <p className="font-body text-sm text-espresso/60">
                        {address}
                      </p>
                    </div>
                  )}
                  {hub.state && (
                    <div className="mt-2">
                      <Badge variant="secondary">{hub.state}</Badge>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="mt-auto">
                  {isPending ? (
                    <Button variant="outline" disabled className="w-full">
                      Request Pending
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      disabled={isDisabled}
                      onClick={() => handleRequest(hub.id)}
                    >
                      {requestingHubId === hub.id
                        ? "Sending..."
                        : "Request Access"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
