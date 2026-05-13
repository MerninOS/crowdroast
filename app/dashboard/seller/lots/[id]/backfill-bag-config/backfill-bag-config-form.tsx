"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@merninos/ui";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@merninos/ui";
import { Input } from "@merninos/ui";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { validateBagConfig } from "@/lib/lots/validate-bag-config";

// Shape of an existing legacy tier the seller needs to convert. Kept narrow
// on purpose — the page only hands us the columns we need to render the row
// and ship the tier_id back to the server.
export type LegacyTier = {
  id: string;
  min_quantity_kg: number;
  price_per_kg: number;
};

interface BackfillBagConfigFormProps {
  lotId: string;
  totalQuantityKg: number;
  minCommitmentKg: number;
  // Server defaults `min_bags_to_succeed` to 1 in schema. Legacy lots will
  // therefore arrive with `1` here; we still let the seller bump it.
  existingMinBagsToSucceed: number;
  hasActiveCampaign: boolean;
  tiers: LegacyTier[];
}

// Per-row state for tier conversion. Stored as strings (not numbers) so the
// input is a controlled component without surprise NaN re-renders while the
// seller is mid-edit.
type TierConversionRow = {
  tier_id: string;
  min_bags: string;
  // The seller may have manually edited the value; we keep a flag so the
  // computed default doesn't overwrite their typed value when bag_size_kg
  // changes downstream. Once they type into the field, that row is "theirs".
  user_edited: boolean;
};

function makeInitialRows(tiers: LegacyTier[]): TierConversionRow[] {
  return tiers.map((t) => ({
    tier_id: t.id,
    min_bags: "",
    user_edited: false,
  }));
}

export function BackfillBagConfigForm({
  lotId,
  totalQuantityKg,
  minCommitmentKg,
  existingMinBagsToSucceed,
  hasActiveCampaign,
  tiers,
}: BackfillBagConfigFormProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [bagSizeKg, setBagSizeKg] = useState("");
  const [minBagsToSucceed, setMinBagsToSucceed] = useState(
    existingMinBagsToSucceed > 0 ? String(existingMinBagsToSucceed) : "1"
  );
  const [tierRows, setTierRows] = useState<TierConversionRow[]>(() =>
    makeInitialRows(tiers)
  );

  // Inline error map keyed by field name (matches the server 400 shape:
  // `{ errors: Record<string, string> }`). We populate this from both
  // client-side `validateBagConfig` and the PATCH response.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>("");

  // --- Derived values (computed during render — no effects needed) ---
  const parsedBagSize = Number.parseInt(bagSizeKg, 10);
  const bagSizeValid =
    Number.isInteger(parsedBagSize) &&
    parsedBagSize >= 1 &&
    parsedBagSize <= 100;

  // Ceiling for min_bags_to_succeed = how many whole bags fit in the lot. We
  // can only compute this once bag size parses cleanly; before then we leave
  // the hint blank rather than show a misleading "0 bags fit".
  const maxBagsPossible = useMemo(() => {
    if (!bagSizeValid) return null;
    return Math.floor(totalQuantityKg / parsedBagSize);
  }, [bagSizeValid, totalQuantityKg, parsedBagSize]);

  const parsedMinBags = Number.parseInt(minBagsToSucceed, 10);
  const minBagsOverCeiling =
    maxBagsPossible !== null &&
    Number.isInteger(parsedMinBags) &&
    parsedMinBags > maxBagsPossible;

  // Suggestion per tier: ceil(legacy_kg_threshold / bag_size_kg). The seller
  // can override by typing into the row; we surface the suggestion as a hint
  // and also pre-fill rows that haven't been touched yet.
  const tierSuggestions = useMemo(() => {
    if (!bagSizeValid) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const t of tiers) {
      map.set(t.id, Math.max(1, Math.ceil(t.min_quantity_kg / parsedBagSize)));
    }
    return map;
  }, [bagSizeValid, parsedBagSize, tiers]);

  // Auto-fill untouched rows with the current suggestion. We re-derive this
  // during render instead of with an effect — pure function of inputs.
  const displayedTierRows: TierConversionRow[] = useMemo(() => {
    return tierRows.map((row) => {
      if (row.user_edited || row.min_bags !== "") return row;
      const suggestion = tierSuggestions.get(row.tier_id);
      if (suggestion === undefined) return row;
      return { ...row, min_bags: String(suggestion) };
    });
  }, [tierRows, tierSuggestions]);

  const handleBagSizeChange = (value: string) => {
    setBagSizeKg(value);
    setFieldErrors((prev) => {
      if (!prev.bag_size_kg && !prev.total_quantity_kg && !prev.min_commitment_kg)
        return prev;
      const next = { ...prev };
      delete next.bag_size_kg;
      delete next.total_quantity_kg;
      delete next.min_commitment_kg;
      return next;
    });
  };

  const handleMinBagsChange = (value: string) => {
    setMinBagsToSucceed(value);
    setFieldErrors((prev) => {
      if (!prev.min_bags_to_succeed) return prev;
      const next = { ...prev };
      delete next.min_bags_to_succeed;
      return next;
    });
  };

  const handleTierChange = (tierId: string, value: string) => {
    setTierRows((prev) =>
      prev.map((row) =>
        row.tier_id === tierId
          ? { ...row, min_bags: value, user_edited: true }
          : row
      )
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasActiveCampaign) return; // belt-and-suspenders — submit is disabled
    setIsSaving(true);
    setFieldErrors({});
    setFormError("");

    // Pre-flight client-side validation matching the server validator. We
    // surface field errors inline and skip the network round-trip when we
    // already know the payload is bad.
    const bagSizeInt = bagSizeKg ? Number.parseInt(bagSizeKg, 10) : null;
    const minBagsInt = minBagsToSucceed
      ? Number.parseInt(minBagsToSucceed, 10)
      : null;

    const preFlight = validateBagConfig({
      bag_size_kg: bagSizeInt,
      min_bags_to_succeed: minBagsInt,
      total_quantity_kg: totalQuantityKg,
      min_commitment_kg: minCommitmentKg,
    });

    // Tier-row validation lives alongside the bag-config check so all errors
    // come back together. Empty / non-integer / < 1 each get their own key.
    const tierErrors: Record<string, string> = {};
    const tierPayload: Array<{ tier_id: string; min_bags: number }> = [];
    for (const row of displayedTierRows) {
      const parsed = Number.parseInt(row.min_bags, 10);
      if (!Number.isInteger(parsed) || parsed < 1) {
        tierErrors[`tier_${row.tier_id}`] =
          "Enter a whole number of bags (1 or more).";
        continue;
      }
      tierPayload.push({ tier_id: row.tier_id, min_bags: parsed });
    }

    if (preFlight.valid === false || Object.keys(tierErrors).length > 0) {
      setFieldErrors({
        ...(preFlight.valid === false ? preFlight.errors : {}),
        ...tierErrors,
      });
      toast.error("Fix the highlighted fields and try again.");
      setIsSaving(false);
      return;
    }

    let response: Response;
    try {
      response = await fetch(`/api/lots/${lotId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bag_size_kg: bagSizeInt,
          min_bags_to_succeed: minBagsInt,
          pricing_tiers_bag_conversion: tierPayload,
        }),
      });
    } catch {
      setFormError("Something went sideways. Try again.");
      toast.error("Something went sideways. Try again.");
      setIsSaving(false);
      return;
    }

    if (response.ok) {
      toast.success("Done. You're good.");
      // Per task spec: redirect to seller's lot detail page. That route
      // doesn't exist yet in-tree, so we fall back to the seller lots list
      // (same target the /edit flow uses on success).
      router.push(`/dashboard/seller/lots/${lotId}`);
      router.refresh();
      return;
    }

    if (response.status === 400) {
      try {
        const data = (await response.json()) as {
          error?: string;
          errors?: Record<string, string>;
        };
        if (data?.errors && typeof data.errors === "object") {
          setFieldErrors(data.errors);
          toast.error("Fix the highlighted fields and try again.");
          setIsSaving(false);
          return;
        }
        if (typeof data?.error === "string" && data.error.trim()) {
          // The active-campaign block on the server returns 400 with a
          // single `error` string. Surface it loud at the top of the form.
          setFormError(data.error);
          toast.error(data.error);
          setIsSaving(false);
          return;
        }
      } catch {
        // fall through
      }
      setFormError("Couldn't save bag config. Try again.");
      toast.error("Couldn't save bag config. Try again.");
      setIsSaving(false);
      return;
    }

    let message = "Couldn't save bag config. Try again.";
    try {
      const data = (await response.json()) as { error?: string };
      if (typeof data?.error === "string" && data.error.trim()) {
        message = data.error;
      }
    } catch {
      // ignore
    }
    setFormError(message);
    toast.error(message);
    setIsSaving(false);
  };

  return (
    <Card className="border-4 border-espresso shadow-flat-md">
      <CardHeader>
        <CardTitle className="font-display text-3xl text-foreground">
          Bag Config
        </CardTitle>
        <CardDescription>
          All inputs in kilograms. Bag size is integer 1–100 kg.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasActiveCampaign && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-3 rounded-lg border-3 border-espresso bg-tomato p-4 text-cream shadow-flat-sm"
          >
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="space-y-1">
              <p className="font-display text-lg leading-tight">
                Can&apos;t change bag config while a campaign is active.
              </p>
              <p className="text-sm">
                End the campaign on this lot first, then come back to backfill.
              </p>
              <p className="text-sm">
                <Link
                  href="/dashboard/seller/lots"
                  className="underline underline-offset-4"
                >
                  Back to lots
                </Link>
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <fieldset disabled={hasActiveCampaign} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="bag_size_kg">Bag Size (kg) *</Label>
                <Input
                  id="bag_size_kg"
                  type="number"
                  required
                  min="1"
                  max="100"
                  step="1"
                  placeholder="69"
                  value={bagSizeKg}
                  onChange={(e) => handleBagSizeChange(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  How big is each bag? Most green coffee ships in 60–69kg bags.
                </p>
                {/* Bag-mental-model hint: once bag size parses cleanly, show
                    the max_bag_count that emerges from the lot's existing
                    total_quantity_kg. Mirrors the create/edit form's "≈ Xkg
                    total" preview but inverted — kg total is fixed here, so
                    the seller sees their bag count instead. */}
                {bagSizeValid && maxBagsPossible !== null && (
                  <p className="text-xs font-semibold text-foreground">
                    ≈ {maxBagsPossible.toLocaleString()} bag
                    {maxBagsPossible === 1 ? "" : "s"} from your{" "}
                    {Math.round(totalQuantityKg).toLocaleString()}kg lot
                  </p>
                )}
                {fieldErrors.bag_size_kg && (
                  <p className="text-xs font-medium text-destructive">
                    {fieldErrors.bag_size_kg}
                  </p>
                )}
                {fieldErrors.total_quantity_kg && (
                  <p className="text-xs font-medium text-destructive">
                    {fieldErrors.total_quantity_kg}
                  </p>
                )}
                {fieldErrors.min_commitment_kg && (
                  <p className="text-xs font-medium text-destructive">
                    {fieldErrors.min_commitment_kg}
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="min_bags_to_succeed">
                  Minimum Bags to Succeed *
                </Label>
                <Input
                  id="min_bags_to_succeed"
                  type="number"
                  required
                  min="1"
                  max={maxBagsPossible ?? undefined}
                  step="1"
                  placeholder="1"
                  value={minBagsToSucceed}
                  onChange={(e) => handleMinBagsChange(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  How many full bags must commit for the campaign to settle?
                </p>
                {maxBagsPossible !== null && (
                  <p className="text-xs font-semibold text-foreground">
                    Ceiling: {maxBagsPossible.toLocaleString()} bag
                    {maxBagsPossible === 1 ? "" : "s"} fit in this lot.
                  </p>
                )}
                {minBagsOverCeiling && maxBagsPossible !== null && (
                  <p className="text-xs font-medium text-destructive">
                    Only {maxBagsPossible.toLocaleString()} bag
                    {maxBagsPossible === 1 ? "" : "s"} fit in{" "}
                    {Math.round(totalQuantityKg).toLocaleString()}kg of lot.
                  </p>
                )}
                {fieldErrors.min_bags_to_succeed && (
                  <p className="text-xs font-medium text-destructive">
                    {fieldErrors.min_bags_to_succeed}
                  </p>
                )}
              </div>
            </div>

            {tiers.length > 0 && (
              <>
                <Separator />

                <div className="space-y-4">
                  <div>
                    <h3 className="font-display text-2xl text-foreground">
                      Re-map your tiers
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Each legacy tier needs a new <strong>min bags</strong> threshold.
                      {bagSizeValid
                        ? " We've suggested defaults based on your bag size — override any of them."
                        : " Enter a bag size above to see suggestions."}
                    </p>
                  </div>

                  <div className="space-y-3">
                    {tiers.map((tier) => {
                      const row = displayedTierRows.find(
                        (r) => r.tier_id === tier.id
                      );
                      const suggestion = tierSuggestions.get(tier.id);
                      const errKey = `tier_${tier.id}`;
                      return (
                        <div
                          key={tier.id}
                          className="grid items-start gap-4 rounded-lg border-3 border-espresso bg-chalk p-4 shadow-flat-sm sm:grid-cols-[1fr_auto_1fr]"
                        >
                          <div>
                            <p className="text-xs font-body uppercase tracking-wide text-muted-foreground">
                              Legacy tier
                            </p>
                            <p className="font-display text-xl leading-tight text-foreground">
                              {Math.round(tier.min_quantity_kg).toLocaleString()}kg
                            </p>
                            <p className="text-sm text-foreground">
                              ${tier.price_per_kg.toFixed(2)}/kg
                            </p>
                          </div>

                          <div
                            aria-hidden
                            className="hidden self-center text-2xl font-display text-tomato sm:block"
                          >
                            →
                          </div>

                          <div className="grid gap-2">
                            <Label htmlFor={`tier-${tier.id}`}>
                              New min bags *
                            </Label>
                            <Input
                              id={`tier-${tier.id}`}
                              type="number"
                              required
                              min="1"
                              step="1"
                              placeholder={
                                suggestion !== undefined
                                  ? String(suggestion)
                                  : "—"
                              }
                              value={row?.min_bags ?? ""}
                              onChange={(e) =>
                                handleTierChange(tier.id, e.target.value)
                              }
                            />
                            {bagSizeValid && suggestion !== undefined && (
                              <p className="text-xs text-muted-foreground">
                                Suggested: {suggestion} bag
                                {suggestion === 1 ? "" : "s"} (
                                {Math.round(tier.min_quantity_kg).toLocaleString()}
                                kg ÷ {parsedBagSize}kg per bag, rounded up)
                              </p>
                            )}
                            {fieldErrors[errKey] && (
                              <p className="text-xs font-medium text-destructive">
                                {fieldErrors[errKey]}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {fieldErrors.pricing_tiers_bag_conversion && (
                    <p className="text-xs font-medium text-destructive">
                      {fieldErrors.pricing_tiers_bag_conversion}
                    </p>
                  )}
                </div>
              </>
            )}
          </fieldset>

          {formError && (
            <div
              role="alert"
              className="rounded-md border-3 border-destructive bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
            >
              {formError}
            </div>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={isSaving || hasActiveCampaign}>
              {isSaving ? "Brewing..." : "Save Bag Config"}
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link href="/dashboard/seller/lots">Cancel</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
