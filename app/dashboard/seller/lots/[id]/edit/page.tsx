"use client";

import React, { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
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
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@merninos/ui";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Lock, AlertTriangle, Package } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { LotImageUploader } from "@/components/lot-image-uploader";
import { useUnitPreference } from "@/components/unit-provider";
import {
  fromDisplayPricePerUnit,
  toDisplayPricePerUnit,
} from "@/lib/units";
import { addPlatformFee } from "@/lib/pricing";

interface TierRow {
  // Bag-count threshold (integer ≥ 1). The PATCH route now writes this
  // directly to `pricing_tiers.min_bags`. Legacy rows that only have
  // `min_quantity_kg` are converted at load time using the current bag size.
  min_bags: string;
  price_per_kg: string;
}

export default function EditLotPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { unit } = useUnitPreference();
  const { id } = use(params);
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [sellerId, setSellerId] = useState("");
  const [headerImageUrl, setHeaderImageUrl] = useState("");
  const [supportingImages, setSupportingImages] = useState<string[]>([]);
  const [hasActiveCampaign, setHasActiveCampaign] = useState(false);
  // `requiresBackfill` flips true when the loaded lot has no bag_size_kg —
  // legacy lots created before the bag-aware migration must go through the
  // dedicated backfill flow before the bag-mental-model edit form is safe.
  const [requiresBackfill, setRequiresBackfill] = useState(false);
  const [form, setForm] = useState({
    title: "",
    origin_country: "",
    region: "",
    farm: "",
    variety: "",
    process: "",
    altitude_min: "",
    altitude_max: "",
    crop_year: "",
    score: "",
    description: "",
    // Bag-mental-model fields (source of truth in the new UI). The kg
    // companions are derived on submit so the PATCH payload still carries
    // total_quantity_kg + min_commitment_kg.
    bag_size_kg: "",
    max_bag_count: "",
    min_bags_to_succeed: "1",
    price_per_kg: "",
    expiry_date: "",
    flavor_notes: "",
    certifications: "",
  });
  const [tiers, setTiers] = useState<TierRow[]>([]);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setSellerId(user?.id || "");

      const res = await fetch(`/api/lots/${id}`);
      if (!res.ok) {
        toast.error("Failed to load lot");
        router.push("/dashboard/seller/lots");
        return;
      }
      const data = await res.json();
      const lot = data.lot;
      setHasActiveCampaign(Boolean(data.has_active_campaign));
      const existingImages = (lot.images || []) as string[];
      setHeaderImageUrl(existingImages[0] || "");
      setSupportingImages(existingImages.slice(1));

      // Compute the bag-shape companions for the form state. When a legacy
      // lot lacks `bag_size_kg`, we flip `requiresBackfill` and leave the bag
      // inputs empty — the UI will surface a banner directing the seller to
      // the backfill page instead of guessing values. The DB constraint
      // (migration: total_quantity_kg must be a clean multiple of bag_size_kg
      // when both are set) guarantees the division below is integer-clean for
      // any lot that already went through backfill or new-lot creation.
      const bagSizeFromDb =
        typeof lot.bag_size_kg === "number" && lot.bag_size_kg > 0
          ? lot.bag_size_kg
          : null;
      const totalKgFromDb =
        typeof lot.total_quantity_kg === "number" && lot.total_quantity_kg > 0
          ? lot.total_quantity_kg
          : null;
      const derivedMaxBagCount =
        bagSizeFromDb && totalKgFromDb
          ? Math.round(totalKgFromDb / bagSizeFromDb)
          : null;
      const minBagsFromDb =
        typeof lot.min_bags_to_succeed === "number" && lot.min_bags_to_succeed > 0
          ? lot.min_bags_to_succeed
          : null;

      setRequiresBackfill(bagSizeFromDb === null);

      setForm({
        title: lot.title || "",
        origin_country: lot.origin_country || "",
        region: lot.region || "",
        farm: lot.farm || "",
        variety: lot.variety || "",
        process: lot.process || "",
        altitude_min: lot.altitude_min?.toString() || "",
        altitude_max: lot.altitude_max?.toString() || "",
        crop_year: lot.crop_year || "",
        score: lot.score?.toString() || "",
        description: lot.description || "",
        bag_size_kg: bagSizeFromDb !== null ? String(bagSizeFromDb) : "",
        max_bag_count:
          derivedMaxBagCount !== null ? String(derivedMaxBagCount) : "",
        min_bags_to_succeed:
          minBagsFromDb !== null ? String(minBagsFromDb) : "1",
        price_per_kg: lot.price_per_kg
          ? toDisplayPricePerUnit(lot.price_per_kg, unit).toString()
          : "",
        expiry_date: (lot.expiry_date || lot.commitment_deadline)?.slice(0, 16) ?? "",
        flavor_notes: (lot.flavor_notes || []).join(", "),
        certifications: (lot.certifications || []).join(", "),
      });

      setTiers(
        (data.pricing_tiers || []).map(
          (t: {
            min_bags: number | null;
            min_quantity_kg: number | null;
            price_per_kg: number;
          }) => {
            // Prefer `min_bags` (post-cutover rows). For legacy rows that only
            // have `min_quantity_kg`, derive bag count from the loaded bag
            // size. If bag size is unknown (legacy lot pre-backfill) we leave
            // the row's `min_bags` blank — the seller has to set it explicitly.
            const minBags =
              typeof t.min_bags === "number" && t.min_bags >= 1
                ? t.min_bags
                : bagSizeFromDb && typeof t.min_quantity_kg === "number"
                  ? Math.max(1, Math.round(t.min_quantity_kg / bagSizeFromDb))
                  : null;
            return {
              min_bags: minBags !== null ? String(minBags) : "",
              price_per_kg: toDisplayPricePerUnit(t.price_per_kg, unit).toString(),
            };
          }
        )
      );
      setInitialLoading(false);
    };
    load();
  }, [id, router, unit]);

  const update = (key: string, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const addTier = () => {
    setTiers((prev) => [...prev, { min_bags: "", price_per_kg: "" }]);
  };

  const updateTier = (idx: number, key: keyof TierRow, value: string) => {
    setTiers((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: value };
      return next;
    });
  };

  const removeTier = (idx: number) => {
    setTiers((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const enteredBasePrice = Number.parseFloat(form.price_per_kg);
    const basePrice = fromDisplayPricePerUnit(enteredBasePrice, unit);

    // Derive kg totals from the bag-mental-model inputs. Bag size is in kg
    // and bag count is unit-agnostic, so this multiplication stays in kg
    // regardless of the display unit toggle. The PATCH route still expects
    // total_quantity_kg + min_commitment_kg in the payload, so we compute
    // them here.
    const bagSizeForSubmit = Number.parseInt(form.bag_size_kg, 10);
    const maxBagCountForSubmit = Number.parseInt(form.max_bag_count, 10);
    if (
      !Number.isInteger(bagSizeForSubmit) ||
      bagSizeForSubmit < 1 ||
      !Number.isInteger(maxBagCountForSubmit) ||
      maxBagCountForSubmit < 1
    ) {
      toast.error("Fill in bag size and max bags before saving.");
      setIsLoading(false);
      return;
    }
    const maxTotal = bagSizeForSubmit * maxBagCountForSubmit;
    // `min_commitment_kg` is the legacy kg threshold; bag-aware settlement
    // is governed by min_bags_to_succeed. Pin to one bag so we satisfy the
    // validator's `min_commitment_kg <= bag_size_kg` rule.
    const minTotal = bagSizeForSubmit;

    // Validate tiers — bag-count thresholds. Each row needs a positive
    // integer `min_bags`, a price lower than the base price, and the full
    // set must be strictly ascending (no duplicates). Mirrors create-lot-form.
    const parsedMinBags: number[] = [];
    for (let i = 0; i < tiers.length; i++) {
      const enteredTierBags = Number.parseInt(tiers[i].min_bags, 10);
      const enteredTierPrice = Number.parseFloat(tiers[i].price_per_kg);
      const tierPrice = fromDisplayPricePerUnit(enteredTierPrice, unit);
      if (!Number.isInteger(enteredTierBags) || enteredTierBags < 1) {
        toast.error(
          `Tier ${i + 1}: min bags must be a whole number of 1 or more`
        );
        setIsLoading(false);
        return;
      }
      if (enteredTierBags > maxBagCountForSubmit) {
        toast.error(
          `Tier ${i + 1}: min bags (${enteredTierBags}) cannot exceed max bags (${maxBagCountForSubmit})`
        );
        setIsLoading(false);
        return;
      }
      if (!tierPrice) {
        toast.error(`Tier ${i + 1}: price is required`);
        setIsLoading(false);
        return;
      }
      if (tierPrice >= basePrice) {
        toast.error(
          `Tier ${i + 1}: price must be lower than the base price ($${enteredBasePrice.toFixed(2)}/${unit})`
        );
        setIsLoading(false);
        return;
      }
      parsedMinBags.push(enteredTierBags);
    }
    for (let i = 1; i < parsedMinBags.length; i++) {
      if (parsedMinBags[i] === parsedMinBags[i - 1]) {
        toast.error(
          `Tier ${i + 1}: min bags (${parsedMinBags[i]}) duplicates Tier ${i}`
        );
        setIsLoading(false);
        return;
      }
      if (parsedMinBags[i] < parsedMinBags[i - 1]) {
        toast.error(
          `Tier ${i + 1}: min bags must be greater than Tier ${i} (${parsedMinBags[i - 1]})`
        );
        setIsLoading(false);
        return;
      }
    }

    // Tier rows submit `min_bags` (integer ≥ 1) and a seller-side price in
    // kg. PATCH writes `pricing_tiers.min_bags` directly and sets
    // `min_quantity_kg = NULL`, mirroring the POST contract.
    const res = await fetch(`/api/lots/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        origin_country: form.origin_country,
        region: form.region,
        farm: form.farm,
        variety: form.variety,
        process: form.process,
        altitude_min: form.altitude_min,
        altitude_max: form.altitude_max,
        crop_year: form.crop_year,
        score: form.score,
        description: form.description,
        total_quantity_kg: maxTotal,
        min_commitment_kg: minTotal,
        price_per_kg: basePrice,
        expiry_date: form.expiry_date,
        flavor_notes: form.flavor_notes
          ? form.flavor_notes.split(",").map((s) => s.trim())
          : [],
        certifications: form.certifications
          ? form.certifications.split(",").map((s) => s.trim())
          : [],
        images: [headerImageUrl, ...supportingImages].filter(Boolean),
        pricing_tiers: tiers.map((t) => ({
          min_bags: Number.parseInt(t.min_bags, 10),
          price_per_kg: fromDisplayPricePerUnit(Number.parseFloat(t.price_per_kg), unit),
        })),
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error || "Failed to update lot");
      setIsLoading(false);
      return;
    }

    toast.success("Lot updated. It has been removed from hub catalogs for review.");
    router.push("/dashboard/seller/lots");
    setIsLoading(false);
  };

  const basePrice = Number.parseFloat(form.price_per_kg) || 0;
  const buyerBasePrice = addPlatformFee(basePrice);

  // Bag-shape derived values for live previews.
  const bagSizeKgParsed = Number.parseInt(form.bag_size_kg, 10);
  const bagSizeKgValid =
    Number.isInteger(bagSizeKgParsed) && bagSizeKgParsed >= 1;
  const maxBagCountParsed = Number.parseInt(form.max_bag_count, 10);
  const maxBagCountValid =
    Number.isInteger(maxBagCountParsed) && maxBagCountParsed >= 1;
  const totalQtyKg =
    bagSizeKgValid && maxBagCountValid
      ? bagSizeKgParsed * maxBagCountParsed
      : 0;
  const minBagsParsed = Number.parseInt(form.min_bags_to_succeed, 10);
  const minBagsValid =
    Number.isInteger(minBagsParsed) && minBagsParsed >= 1;
  const maxBagsPossible: number | null = maxBagCountValid
    ? maxBagCountParsed
    : null;
  const minBagsOverCeiling =
    maxBagsPossible !== null && minBagsValid && minBagsParsed > maxBagsPossible;
  const minBagsKgPreview =
    bagSizeKgValid && minBagsValid ? bagSizeKgParsed * minBagsParsed : 0;

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading lot...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <Link
        href="/dashboard/seller/lots"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Lots
      </Link>

      {hasActiveCampaign && (
        <Card className="mb-6 border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="flex items-start gap-3 pt-6">
            <Lock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Editing Locked</p>
              <p className="text-sm text-muted-foreground mt-1">
                A hub owner is currently running a campaign on this lot. You can
                edit it again once the campaign closes.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <CardTitle>Edit Lot</CardTitle>
            {hasActiveCampaign && (
              <Badge variant="secondary" className="gap-1">
                <Lock className="h-3 w-3" />
                Locked
              </Badge>
            )}
          </div>
          <CardDescription>
            {hasActiveCampaign
              ? "This lot cannot be edited while a campaign is active."
              : "Update your lot details. Changes will remove this lot from hub catalogs so hub owners can review before re-adding."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <fieldset disabled={hasActiveCampaign} className="space-y-6">
              {!hasActiveCampaign && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/10 p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">
                    Saving changes will remove this lot from all hub catalogs. Hub
                    owners will need to re-add it after reviewing your updates.
                  </p>
                </div>
              )}

              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="title">Lot Title *</Label>
                  <Input
                    id="title"
                    required
                    value={form.title}
                    onChange={(e) => update("title", e.target.value)}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="origin_country">Origin Country *</Label>
                    <Input
                      id="origin_country"
                      required
                      value={form.origin_country}
                      onChange={(e) => update("origin_country", e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="region">Region</Label>
                    <Input
                      id="region"
                      value={form.region}
                      onChange={(e) => update("region", e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="farm">Farm</Label>
                    <Input
                      id="farm"
                      value={form.farm}
                      onChange={(e) => update("farm", e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="variety">Variety</Label>
                    <Input
                      id="variety"
                      value={form.variety}
                      onChange={(e) => update("variety", e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="process">Process</Label>
                    <Input
                      id="process"
                      value={form.process}
                      onChange={(e) => update("process", e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="crop_year">Crop Year</Label>
                    <Input
                      id="crop_year"
                      value={form.crop_year}
                      onChange={(e) => update("crop_year", e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="grid gap-2">
                    <Label htmlFor="altitude_min">Altitude Min (m)</Label>
                    <Input
                      id="altitude_min"
                      type="number"
                      value={form.altitude_min}
                      onChange={(e) => update("altitude_min", e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="altitude_max">Altitude Max (m)</Label>
                    <Input
                      id="altitude_max"
                      type="number"
                      value={form.altitude_max}
                      onChange={(e) => update("altitude_max", e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="score">Score</Label>
                    <Input
                      id="score"
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={form.score}
                      onChange={(e) => update("score", e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    rows={3}
                    value={form.description}
                    onChange={(e) => update("description", e.target.value)}
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">
                  Pricing & Quantity
                </h3>
                <p className="text-sm text-muted-foreground">
                  Bag-shape inputs drive the lot. We derive kg totals when
                  you save.
                </p>
                <p className="text-xs font-medium text-foreground">
                  Price is entered as ${`/`}{unit}.
                </p>

                {requiresBackfill && (
                  <div
                    role="alert"
                    className="flex items-start gap-3 rounded-lg border border-amber-500/50 bg-amber-50 p-3 dark:bg-amber-950/20"
                  >
                    <Package className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        Backfill required
                      </p>
                      <p className="text-xs text-muted-foreground">
                        This is a legacy lot with no bag config. Run the
                        backfill flow before editing bag fields.{" "}
                        <Link
                          href={`/dashboard/seller/lots/${id}/backfill-bag-config`}
                          className="font-medium text-foreground underline underline-offset-2"
                        >
                          Go to backfill
                        </Link>
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-3">
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
                      value={form.bag_size_kg}
                      onChange={(e) => update("bag_size_kg", e.target.value)}
                      disabled={requiresBackfill}
                    />
                    <p className="text-xs text-muted-foreground">
                      Bag size in kg. Most green coffee ships 60–69kg bags.
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="max_bag_count">Max Bags Available *</Label>
                    <Input
                      id="max_bag_count"
                      type="number"
                      required
                      min="1"
                      step="1"
                      placeholder="15"
                      value={form.max_bag_count}
                      onChange={(e) => update("max_bag_count", e.target.value)}
                      disabled={requiresBackfill}
                    />
                    <p className="text-xs text-muted-foreground">
                      How many bags total can you ship? We&apos;ll multiply
                      by your bag size to figure out the lot&apos;s max kg.
                    </p>
                    {bagSizeKgValid && maxBagCountValid && (
                      <p className="text-xs font-semibold text-foreground">
                        ≈ {totalQtyKg.toLocaleString()}kg total
                      </p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="price_per_kg">Base Price ($/{unit}) *</Label>
                    <Input
                      id="price_per_kg"
                      type="number"
                      step="0.01"
                      required
                      min="0"
                      value={form.price_per_kg}
                      onChange={(e) => update("price_per_kg", e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      This is the amount you receive. Buyers see {basePrice > 0 ? `$${buyerBasePrice.toFixed(2)}/${unit}` : "your price plus 10%"}.
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
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
                      value={form.min_bags_to_succeed}
                      onChange={(e) =>
                        update("min_bags_to_succeed", e.target.value)
                      }
                      disabled={requiresBackfill}
                    />
                    <p className="text-xs text-muted-foreground">
                      How few bags will you ship if the campaign doesn&apos;t
                      fill all of them? Default: 1.
                    </p>
                    {bagSizeKgValid && minBagsValid && (
                      <p className="text-xs font-semibold text-foreground">
                        ≈ {minBagsKgPreview.toLocaleString()}kg to settle
                      </p>
                    )}
                    {minBagsOverCeiling && maxBagsPossible !== null && (
                      <p className="text-xs font-medium text-destructive">
                        Only {maxBagsPossible.toLocaleString()} bag
                        {maxBagsPossible === 1 ? "" : "s"} available — set min
                        bags to {maxBagsPossible.toLocaleString()} or fewer.
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="expiry_date">
                    Lot Expiry Date *
                  </Label>
                  <Input
                    id="expiry_date"
                    type="datetime-local"
                    required
                    value={form.expiry_date}
                    onChange={(e) =>
                      update("expiry_date", e.target.value)
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    How long this lot is available. Hub campaigns must end before this date.
                  </p>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">
                      Volume Discount Tiers
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Lower the price per {unit} once the campaign reaches a
                      bag count.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addTier}
                    disabled={hasActiveCampaign}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Add Tier
                  </Button>
                </div>

                <div className="rounded-lg border bg-muted/30 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Base Tier (minimum)
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {minBagsValid
                          ? `${minBagsParsed.toLocaleString()} bag${minBagsParsed === 1 ? "" : "s"}`
                          : "Set min bags above"}
                      </p>
                    </div>
                    <p className="text-lg font-bold text-foreground">
                      {basePrice > 0 ? `$${basePrice.toFixed(2)}/${unit}` : "--"}
                    </p>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Buyers see {basePrice > 0 ? `$${buyerBasePrice.toFixed(2)}/${unit}` : "--"}, including the 10% platform fee. You still receive the full base price above.
                  </p>
                </div>

                {tiers.map((tier, idx) => {
                  const tierBagsNum = Number.parseInt(tier.min_bags, 10);
                  const tierBagsValid =
                    Number.isInteger(tierBagsNum) && tierBagsNum >= 1;
                  const tierKgPreview =
                    bagSizeKgValid && tierBagsValid
                      ? bagSizeKgParsed * tierBagsNum
                      : 0;
                  return (
                    <div key={idx} className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-foreground">
                          Tier {idx + 1}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeTier(idx)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-2">
                          <Label>Unlocks at (bags)</Label>
                          <Input
                            type="number"
                            min={2}
                            max={maxBagsPossible ?? undefined}
                            step="1"
                            value={tier.min_bags}
                            onChange={(e) =>
                              updateTier(idx, "min_bags", e.target.value)
                            }
                          />
                          {tierBagsValid && bagSizeKgValid && (
                            <p className="text-xs text-muted-foreground">
                              ≈ {tierKgPreview.toLocaleString()}kg total
                            </p>
                          )}
                        </div>
                        <div className="grid gap-2">
                          <Label>Price per {unit} ($)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max={
                              basePrice > 0 ? basePrice - 0.01 : undefined
                            }
                            value={tier.price_per_kg}
                            onChange={(e) =>
                              updateTier(idx, "price_per_kg", e.target.value)
                            }
                          />
                        </div>
                      </div>
                      {tier.min_bags && tier.price_per_kg && (
                        <p className="text-xs text-muted-foreground">
                          At this tier, you receive $
                          {Number.parseFloat(tier.price_per_kg).toFixed(2)}/{unit}{" "}
                          and buyers pay $
                          {addPlatformFee(Number.parseFloat(tier.price_per_kg)).toFixed(2)}/{unit}.
                        </p>
                      )}
                    </div>
                  );
                })}

                {tiers.length === 0 && (
                  <p className="text-sm text-muted-foreground italic">
                    No volume discounts. Add tiers to incentivize group buying.
                  </p>
                )}
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Lot Images</h3>
                <p className="text-sm text-muted-foreground">
                  Set a header image and supporting gallery for buyers and hub owners.
                </p>
                <LotImageUploader
                  sellerId={sellerId}
                  headerImageUrl={headerImageUrl}
                  supportingImages={supportingImages}
                  onChange={({ headerImageUrl: nextHeader, supportingImages: nextSupporting }) => {
                    setHeaderImageUrl(nextHeader);
                    setSupportingImages(nextSupporting);
                  }}
                  disabled={hasActiveCampaign || isLoading}
                />
              </div>

              <Separator />

              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="flavor_notes">
                    Flavor Notes (comma separated)
                  </Label>
                  <Input
                    id="flavor_notes"
                    value={form.flavor_notes}
                    onChange={(e) => update("flavor_notes", e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="certifications">
                    Certifications (comma separated)
                  </Label>
                  <Input
                    id="certifications"
                    value={form.certifications}
                    onChange={(e) => update("certifications", e.target.value)}
                  />
                </div>
              </div>
            </fieldset>

            {!hasActiveCampaign && (
              <div className="flex gap-3">
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "Saving..." : "Save Changes"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push("/dashboard/seller/lots")}
                >
                  Cancel
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
