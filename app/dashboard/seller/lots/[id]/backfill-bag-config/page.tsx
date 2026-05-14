import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@merninos/ui";
import { Button } from "@merninos/ui";
import { ArrowLeft } from "lucide-react";
import type { Lot } from "@/lib/types";
import { BackfillBagConfigForm } from "./backfill-bag-config-form";

// Server component (Task 3.6): auth-gate the route, fetch the lot + tiers, and
// redirect away if there's nothing to backfill. Form interaction lives in the
// sibling client component.
//
// We deliberately keep this small and dumb: any seller can hit
// `/dashboard/seller/lots/<lotId>/backfill-bag-config` and we just verify
// ownership against `lots.seller_id = auth.user.id` before rendering. The
// `PATCH /api/lots/[id]` handler re-checks all of this on submit (auth +
// active-campaign + validate), so this page is the optimistic surface — it
// short-circuits a bunch of "you can't be here" cases up front instead of
// making the seller fill the form just to bounce.

export default async function BackfillBagConfigPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/login");
  }

  // Owner-only access. Querying with `eq('seller_id', user.id)` collapses the
  // 404 (not found) and 403 (someone else's lot) cases into the same outcome
  // intentionally — we don't want to leak "this lot exists but isn't yours".
  const { data: lot, error: lotErr } = await supabase
    .from("lots")
    .select(
      "id, seller_id, title, total_quantity_kg, min_commitment_kg, bag_size_kg, min_bags_to_succeed, status"
    )
    .eq("id", id)
    .eq("seller_id", user.id)
    .single();

  if (lotErr || !lot) {
    notFound();
  }

  // Already-configured short-circuit. The PATCH route doesn't strictly forbid
  // a re-backfill, but the seller's mental model here is "fix a legacy lot",
  // and once `bag_size_kg` is set the lot belongs in /edit, not here.
  if (lot.bag_size_kg !== null) {
    return (
      <div className="max-w-2xl">
        <Link
          href="/dashboard/seller/lots"
          className="mb-6 inline-flex items-center gap-1 text-sm font-body uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Lots
        </Link>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-3xl text-foreground">
              Already squared away.
            </CardTitle>
            <CardDescription>
              This lot already has bag config set. Nothing to backfill.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              <Link href={`/dashboard/seller/lots/${id}/edit`}>Edit this lot</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/seller/lots">Back to lots</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Fetch existing pricing tiers so the seller can re-map kg-tiers → bag-tiers
  // in the same flow. Sorted by min_quantity_kg ASC so the rows render in the
  // intuitive small → big order they were authored in.
  const { data: tiers } = await supabase
    .from("pricing_tiers")
    .select("id, lot_id, min_quantity_kg, min_bags, price_per_kg, created_at")
    .eq("lot_id", id)
    .order("min_quantity_kg", { ascending: true });

  // Pre-flight the active-campaign gate just to choose copy. The PATCH handler
  // is still the source of truth — it re-checks on submit and returns 400 if
  // a campaign appeared between page load and form submit.
  const { data: activeCampaign } = await supabase
    .from("campaigns")
    .select("id")
    .eq("lot_id", id)
    .eq("status", "active")
    .maybeSingle();

  return (
    <div className="max-w-3xl">
      <Link
        href="/dashboard/seller/lots"
        className="mb-6 inline-flex items-center gap-1 text-sm font-body uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Lots
      </Link>

      <div className="mb-6">
        <h1 className="font-display text-5xl leading-none text-foreground sm:text-6xl">
          Set up this lot&apos;s bags.
        </h1>
        <p className="mt-4 max-w-prose text-base text-muted-foreground">
          This lot was created before bag-aware campaigns. Tell us how it ships
          and re-map your tiers from kg over to bags. Buyers can&apos;t commit
          again until this is squared away.
        </p>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          Lot: <span className="font-semibold text-foreground">{lot.title}</span>
        </p>
      </div>

      <BackfillBagConfigForm
        lotId={lot.id}
        totalQuantityKg={(lot as Lot).total_quantity_kg}
        minCommitmentKg={(lot as Lot).min_commitment_kg}
        existingMinBagsToSucceed={(lot as Lot).min_bags_to_succeed}
        hasActiveCampaign={Boolean(activeCampaign)}
        tiers={
          (tiers ?? [])
            .filter((t) => t.min_quantity_kg !== null && t.min_quantity_kg !== undefined)
            .map((t) => ({
              id: t.id,
              min_quantity_kg: Number(t.min_quantity_kg),
              price_per_kg: t.price_per_kg,
            }))
        }
      />
    </div>
  );
}
