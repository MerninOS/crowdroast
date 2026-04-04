"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/mernin/Card";
import { Button } from "@/components/mernin/Button";
import { Badge } from "@/components/mernin/Badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Calendar, AlertCircle } from "lucide-react";
import Link from "next/link";

interface LotInfo {
  id: string;
  title: string;
  origin_country: string;
  region: string | null;
  expiry_date: string | null;
}

function toLocalDatetimeString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function CampaignSetupPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const lotId = searchParams.get("lot");
  const hubId = searchParams.get("hub");

  const [lot, setLot] = useState<LotInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [deadline, setDeadline] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Compute min/max for the datetime input
  const now = new Date();
  const minDatetime = toLocalDatetimeString(now);

  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const lotExpiry = lot?.expiry_date ? new Date(lot.expiry_date) : null;
  const maxDate =
    lotExpiry && lotExpiry < thirtyDaysFromNow ? lotExpiry : thirtyDaysFromNow;
  const maxDatetime = toLocalDatetimeString(maxDate);

  useEffect(() => {
    if (!lotId) {
      setLoading(false);
      return;
    }

    const fetchLot = async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("lots")
        .select("id, title, origin_country, region, expiry_date")
        .eq("id", lotId)
        .single();

      if (error || !data) {
        setFetchError("Couldn't find that lot. It may have been removed.");
        setLoading(false);
        return;
      }

      setLot(data as LotInfo);
      setLoading(false);
    };

    fetchLot();
  }, [lotId]);

  function validate(value: string): string | null {
    if (!value) return "Pick a deadline before launching.";
    const chosen = new Date(value);
    if (chosen <= new Date()) return "Deadline must be in the future.";
    const limit = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    if (chosen > limit) return "Deadline can't be more than 30 days out.";
    if (lotExpiry && chosen >= lotExpiry)
      return "Deadline must be before the lot expires.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate(deadline);
    if (err) {
      setValidationError(err);
      return;
    }

    setSubmitting(true);
    setValidationError(null);

    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lot_id: lotId,
          hub_id: hubId,
          deadline: new Date(deadline).toISOString(),
        }),
      });

      if (!res.ok) {
        const result = await res.json();
        setValidationError(
          result.error || "Something went sideways. Try again."
        );
        setSubmitting(false);
        return;
      }

      toast.success("Campaign launched!");
      router.push("/dashboard/hub/catalog");
    } catch {
      setValidationError("Something went sideways. Check your connection.");
      setSubmitting(false);
    }
  }

  // Missing params — send them back
  if (!lotId || !hubId) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-20">
        <AlertCircle className="h-12 w-12 text-tomato" />
        <p className="font-body text-lg text-espresso">
          Missing lot or hub info. Head back to the catalog to start a campaign.
        </p>
        <Link href="/dashboard/hub/catalog">
          <Button variant="outline">Back to Catalog</Button>
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-12">
        <Skeleton className="h-8 w-48" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-64" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-36" />
          </CardContent>
        </Card>
        <p className="text-center font-body text-sm text-espresso/60">
          Brewing...
        </p>
      </div>
    );
  }

  if (fetchError || !lot) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-20">
        <AlertCircle className="h-12 w-12 text-tomato" />
        <p className="font-body text-lg text-espresso">
          {fetchError || "Something went sideways."}
        </p>
        <Link href="/dashboard/hub/catalog">
          <Button variant="outline">Back to Catalog</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg py-8">
      <h1 className="mb-6 font-headline text-3xl text-espresso">
        Launch Campaign
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>{lot.title}</CardTitle>
          <p className="mt-1 font-body text-sm text-espresso/60">
            {lot.origin_country}
            {lot.region ? `, ${lot.region}` : ""}
          </p>
          {lot.expiry_date && (
            <Badge variant="hot" className="mt-2 w-fit">
              <Calendar className="mr-1 h-3 w-3" />
              Lot expires{" "}
              {new Date(lot.expiry_date).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </Badge>
          )}
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="deadline"
                className="mb-1.5 block font-body text-sm font-bold uppercase tracking-[0.08em] text-espresso"
              >
                Campaign Deadline
              </label>
              <input
                id="deadline"
                type="datetime-local"
                value={deadline}
                min={minDatetime}
                max={maxDatetime}
                onChange={(e) => {
                  setDeadline(e.target.value);
                  setValidationError(null);
                }}
                className="w-full rounded-[12px] border-3 border-espresso bg-chalk px-4 py-3 font-body text-base text-espresso shadow-flat-sm outline-none transition-all duration-100 focus:-translate-x-px focus:-translate-y-px focus:border-tomato focus:shadow-flat-md"
              />
              <p className="mt-1.5 font-body text-xs text-espresso/50">
                Buyers in your hub will have until this date to commit. Max 30
                days.
              </p>
            </div>

            {validationError && (
              <div className="flex items-start gap-2 rounded-[12px] border-3 border-tomato bg-tomato/10 px-4 py-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-tomato" />
                <p className="font-body text-sm text-tomato">
                  {validationError}
                </p>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Brewing..." : "Launch Campaign"}
              </Button>
              <Link href="/dashboard/hub/catalog">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
