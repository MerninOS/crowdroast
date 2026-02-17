import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarClock } from "lucide-react";

export default async function BuyerCuppingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: memberships } = await supabase
    .from("hub_members")
    .select("hub_id")
    .eq("user_id", user.id)
    .eq("status", "active");

  const hubIds = (memberships || []).map((m) => m.hub_id);

  const nowIso = new Date().toISOString();
  const { data: cuppings } =
    hubIds.length > 0
      ? await supabase
          .from("cupping_events")
          .select("id, scheduled_at, notes, hub:hubs!cupping_events_hub_id_fkey(name, city, state, country)")
          .in("hub_id", hubIds)
          .gte("scheduled_at", nowIso)
          .order("scheduled_at", { ascending: true })
      : { data: [] };

  const items = cuppings || [];
  const eventIds = items.map((item) => item.id);
  const { data: eventSamples } =
    eventIds.length > 0
      ? await supabase
          .from("cupping_event_samples")
          .select("cupping_event_id, sample_request_id")
          .in("cupping_event_id", eventIds)
      : { data: [] };

  const sampleIds = [...new Set((eventSamples || []).map((row) => row.sample_request_id))];
  const { data: sampleRows } =
    sampleIds.length > 0
      ? await supabase
          .from("sample_requests")
          .select("id, lot:lots!sample_requests_lot_id_fkey(title, origin_country)")
          .in("id", sampleIds)
      : { data: [] };

  const sampleById = new Map((sampleRows || []).map((row) => [row.id, row]));
  const sampleIdsByEvent = new Map<string, string[]>();
  for (const row of eventSamples || []) {
    sampleIdsByEvent.set(row.cupping_event_id, [
      ...(sampleIdsByEvent.get(row.cupping_event_id) || []),
      row.sample_request_id,
    ]);
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Cuppings</h1>
        <p className="text-sm text-muted-foreground mt-1">Upcoming cupping events hosted by your hub owner.</p>
      </div>

      {items.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center py-10 px-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-muted-foreground mb-4">
              <CalendarClock className="h-6 w-6" />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              No upcoming cuppings yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item: any) => (
            <Card key={item.id} className="shadow-sm">
              <CardContent className="p-4">
                {(() => {
                  const coffees = (sampleIdsByEvent.get(item.id) || [])
                    .map((sampleId) => {
                      const sample = sampleById.get(sampleId) as any;
                      return sample?.lot?.title || "Coffee";
                    });
                  const locationParts = [
                    item.hub?.name || "Hub",
                    item.hub?.city,
                    item.hub?.state,
                    item.hub?.country,
                  ].filter(Boolean);
                  const icsHref = buildIcsDataUri({
                    title: `CrowdRoast Cupping - ${item.hub?.name || "Hub"}`,
                    description: `Coffees: ${coffees.join(", ") || "Coffee samples"}`,
                    location: locationParts.join(", "),
                    start: new Date(item.scheduled_at),
                    end: new Date(new Date(item.scheduled_at).getTime() + 90 * 60 * 1000),
                    uid: item.id,
                  });

                  return (
                    <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">Cupping Event</p>
                    {!!item.notes && (
                      <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs">
                    Upcoming
                  </Badge>
                </div>
                <div className="mt-3 text-sm">
                  <p className="text-xs text-muted-foreground">When</p>
                  <p className="font-medium text-foreground">
                    {new Date(item.scheduled_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <div className="mt-2 text-sm">
                  <p className="text-xs text-muted-foreground">Hub</p>
                  <p className="font-medium text-foreground">
                    {item.hub?.name || "Hub"}{" "}
                    {[item.hub?.city, item.hub?.state, item.hub?.country]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
                <div className="mt-3 text-sm">
                  <p className="text-xs text-muted-foreground mb-1">Coffees</p>
                  <div className="space-y-1">
                    {(sampleIdsByEvent.get(item.id) || []).map((sampleId) => {
                      const sample = sampleById.get(sampleId) as any;
                      return (
                        <p key={`${item.id}-${sampleId}`} className="text-sm text-foreground">
                          {sample?.lot?.title || "Coffee"}{" "}
                          <span className="text-xs text-muted-foreground">
                            {sample?.lot?.origin_country || ""}
                          </span>
                        </p>
                      );
                    })}
                  </div>
                </div>
                <div className="mt-4">
                  <Button asChild size="sm" variant="outline">
                    <a href={icsHref} download={`cupping-${item.id}.ics`}>
                      Add to Calendar
                    </a>
                  </Button>
                </div>
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function buildIcsDataUri({
  title,
  description,
  location,
  start,
  end,
  uid,
}: {
  title: string;
  description: string;
  location: string;
  start: Date;
  end: Date;
  uid: string;
}) {
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CrowdRoast//Cupping Event//EN",
    "BEGIN:VEVENT",
    `UID:${escapeIcs(uid)}@crowdroast`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(start)}`,
    `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:${escapeIcs(title)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    `LOCATION:${escapeIcs(location)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

function formatIcsDate(date: Date) {
  return date
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(/\.\d{3}Z$/, "Z");
}

function escapeIcs(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\n", "\\n");
}
