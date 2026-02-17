"use client";

import React from "react";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FlaskConical, CalendarClock, Truck, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import type { Hub } from "@/lib/types";

const statusStyles: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  shipped: "bg-blue-50 text-blue-700 border-blue-200",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

type CuppingEventItem = {
  id: string;
  scheduled_at: string;
  notes: string | null;
};

export default function HubSamplesPage() {
  const router = useRouter();
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [selectedHubId, setSelectedHubId] = useState<string>("");
  const [samples, setSamples] = useState<any[]>([]);
  const [events, setEvents] = useState<CuppingEventItem[]>([]);
  const [eventSampleMap, setEventSampleMap] = useState<Record<string, string[]>>({});
  const [scheduledAtInput, setScheduledAtInput] = useState("");
  const [eventNotes, setEventNotes] = useState("");
  const [selectedSampleIds, setSelectedSampleIds] = useState<string[]>([]);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);

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
    const load = async () => {
      const supabase = createClient();
      const { data: sampleData } = await supabase
        .from("sample_requests")
        .select("*, lot:lots!sample_requests_lot_id_fkey(title, origin_country)")
        .eq("hub_id", selectedHubId)
        .order("created_at", { ascending: false });

      setSamples(sampleData || []);

      const { data: eventData } = await supabase
        .from("cupping_events")
        .select("id, scheduled_at, notes")
        .eq("hub_id", selectedHubId)
        .gte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true });

      const items = (eventData || []) as CuppingEventItem[];
      setEvents(items);

      if (items.length > 0) {
        const eventIds = items.map((event) => event.id);
        const { data: eventSamples } = await supabase
          .from("cupping_event_samples")
          .select("cupping_event_id, sample_request_id")
          .in("cupping_event_id", eventIds);

        const nextMap: Record<string, string[]> = {};
        for (const item of eventSamples || []) {
          if (!nextMap[item.cupping_event_id]) nextMap[item.cupping_event_id] = [];
          nextMap[item.cupping_event_id].push(item.sample_request_id);
        }
        setEventSampleMap(nextMap);
      } else {
        setEventSampleMap({});
      }
    };
    load();
  }, [selectedHubId]);

  const toggleSelectedSample = (sampleId: string, checked: boolean) => {
    setSelectedSampleIds((prev) =>
      checked ? [...new Set([...prev, sampleId])] : prev.filter((id) => id !== sampleId)
    );
  };

  const seedWithSample = (sampleId: string) => {
    setSelectedSampleIds((prev) => [...new Set([...prev, sampleId])]);
    if (!scheduledAtInput) {
      const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      setScheduledAtInput(local);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const createCuppingEvent = async () => {
    if (!scheduledAtInput) {
      toast.error("Choose a date and time first");
      return;
    }
    if (selectedSampleIds.length === 0) {
      toast.error("Select at least one coffee");
      return;
    }

    setIsCreatingEvent(true);
    try {
      const res = await fetch("/api/cuppings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hub_id: selectedHubId,
          scheduled_at: new Date(scheduledAtInput).toISOString(),
          sample_request_ids: selectedSampleIds,
          notes: eventNotes,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create cupping event");
      }
      const created = await res.json();
      toast.success("Cupping scheduled");
      router.refresh();
      setScheduledAtInput("");
      setEventNotes("");
      setSelectedSampleIds([]);
      setEvents((prev) =>
        [...prev, created].sort(
          (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
        )
      );
      setEventSampleMap((prev) => ({ ...prev, [created.id]: selectedSampleIds }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create cupping");
    } finally {
      setIsCreatingEvent(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Sample Requests</h1>
          <p className="text-sm text-muted-foreground mt-1">Create cupping events and assign multiple requested coffees.</p>
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

      {samples.length > 0 && (
        <Card className="mb-6 shadow-sm">
          <CardContent className="p-4 space-y-4">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <PlusCircle className="h-4 w-4" />
                Create Cupping Event
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Select one or more coffees to include in this event.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Date & Time</p>
                <Input
                  type="datetime-local"
                  value={scheduledAtInput}
                  onChange={(e) => setScheduledAtInput(e.target.value)}
                />
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Notes (optional)</p>
                <Textarea
                  rows={2}
                  value={eventNotes}
                  onChange={(e) => setEventNotes(e.target.value)}
                  placeholder="Room, host instructions, etc."
                />
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs text-muted-foreground">Coffees in this cupping</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {samples.map((sample) => (
                  <label
                    key={`select-${sample.id}`}
                    className="flex items-start gap-2 rounded-md border p-2 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedSampleIds.includes(sample.id)}
                      onCheckedChange={(checked) =>
                        toggleSelectedSample(sample.id, Boolean(checked))
                      }
                    />
                    <span className="text-xs text-foreground">
                      {sample.lot?.title || "Unknown"} ({sample.quantity_grams}g)
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={createCuppingEvent} disabled={isCreatingEvent}>
                {isCreatingEvent ? "Scheduling..." : "Schedule Cupping"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {events.length > 0 && (
        <Card className="mb-6 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-foreground mb-3">Upcoming Cuppings</p>
            <div className="space-y-3">
              {events.map((event) => (
                <div key={event.id} className="rounded-md border p-3">
                  <p className="text-sm font-medium text-foreground">
                    {new Date(event.scheduled_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                  {!!event.notes && (
                    <p className="text-xs text-muted-foreground mt-1">{event.notes}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(eventSampleMap[event.id] || []).map((sampleId) => {
                      const sample = samples.find((s) => s.id === sampleId);
                      return (
                        <Badge key={`${event.id}-${sampleId}`} variant="secondary" className="text-xs">
                          {sample?.lot?.title || "Coffee"}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
                      Requested {new Date(s.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
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
                    <p className="text-xs text-muted-foreground">Delivery</p>
                    <p className="font-medium text-foreground truncate max-w-56">
                      {s.shipping_address || "No delivery details"}
                    </p>
                  </div>
                </div>
                {s.tracking_number && (
                  <div className="mt-3 rounded-md border bg-muted/30 px-3 py-2">
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Truck className="h-3 w-3" />
                      Tracking Number
                    </p>
                    <p className="font-mono text-xs text-foreground mt-1">{s.tracking_number}</p>
                  </div>
                )}
                <div className="mt-4 flex justify-end">
                  <Button
                    variant="outline"
                    onClick={() => seedWithSample(s.id)}
                    className="bg-transparent"
                  >
                    <CalendarClock className="mr-2 h-4 w-4" />
                    Host a Cupping
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
