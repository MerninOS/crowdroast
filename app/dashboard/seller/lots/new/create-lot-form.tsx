"use client";

import React, { useEffect, useState } from "react";
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
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { LotImageUploader } from "@/components/lot-image-uploader";
import { useUnitPreference } from "@/components/unit-provider";
import {
  fromDisplayPricePerUnit,
  fromDisplayWeight,
} from "@/lib/units";
import { addPlatformFee } from "@/lib/pricing";

interface TierRow {
  min_quantity_kg: string;
  price_per_kg: string;
}

export function CreateLotForm() {
  const { unit } = useUnitPreference();
  const router = useRouter();
  const [sellerId, setSellerId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [headerImageUrl, setHeaderImageUrl] = useState("");
  const [supportingImages, setSupportingImages] = useState<string[]>([]);
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
    total_quantity_kg: "",
    min_commitment_kg: "",
    price_per_kg: "",
    bag_size_kg: "",
    min_bags_to_succeed: "1",
    expiry_date: "",
    flavor_notes: "",
    certifications: "",
  });

  const [tiers, setTiers] = useState<TierRow[]>([]);
  // Per-field error messages returned by /api/lots (400 response shape:
  // `{ errors: Record<string, string> }`). Keyed by the same field names the
  // form already uses so we can render them inline next to each input.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Top-level form-wide error for non-2xx responses without a field map
  // (network errors, 500s, 401/403, etc.).
  const [formError, setFormError] = useState<string>("");

  useEffect(() => {
    const loadUser = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setSellerId(user?.id || "");
    };
    void loadUser();
  }, []);

  const update = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    // Clear the field's server error as soon as the user edits it — keeps
    // the inline error in lockstep with the current input value.
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const addTier = () => {
    setTiers((prev) => [...prev, { min_quantity_kg: "", price_per_kg: "" }]);
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
    setFieldErrors({});
    setFormError("");

    const enteredBasePrice = Number.parseFloat(form.price_per_kg);
    const enteredMinTotal = Number.parseFloat(form.min_commitment_kg);
    const enteredMaxTotal = Number.parseFloat(form.total_quantity_kg);
    const basePrice = fromDisplayPricePerUnit(enteredBasePrice, unit);
    const minTotal = fromDisplayWeight(enteredMinTotal, unit);
    const maxTotal = fromDisplayWeight(enteredMaxTotal, unit);

    // Validate tiers
    for (let i = 0; i < tiers.length; i++) {
      const enteredTierQty = Number.parseFloat(tiers[i].min_quantity_kg);
      const enteredTierPrice = Number.parseFloat(tiers[i].price_per_kg);
      const tierQty = fromDisplayWeight(enteredTierQty, unit);
      const tierPrice = fromDisplayPricePerUnit(enteredTierPrice, unit);
      if (!tierQty || !tierPrice) {
        toast.error(`Tier ${i + 1}: quantity and price are required`);
        setIsLoading(false);
        return;
      }
      if (tierQty <= minTotal) {
        toast.error(
          `Tier ${i + 1}: quantity (${enteredTierQty} ${unit}) must be above the minimum trigger (${enteredMinTotal} ${unit})`
        );
        setIsLoading(false);
        return;
      }
      if (tierQty > maxTotal) {
        toast.error(
          `Tier ${i + 1}: quantity (${enteredTierQty} ${unit}) cannot exceed the maximum (${enteredMaxTotal} ${unit})`
        );
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
    }

    // POST through /api/lots so bag-aware validation runs server-side (Task
    // 1.8). The route is responsible for auth, role/Stripe gating, and the
    // bag-size/min-bags checks; we no longer touch supabase.from('lots')
    // directly from the form.
    const bagSizeInt = form.bag_size_kg ? Number.parseInt(form.bag_size_kg, 10) : null;
    const minBagsInt = form.min_bags_to_succeed
      ? Number.parseInt(form.min_bags_to_succeed, 10)
      : null;

    const payload = {
      title: form.title,
      origin_country: form.origin_country,
      region: form.region || null,
      farm: form.farm || null,
      variety: form.variety || null,
      process: form.process || null,
      altitude_min: form.altitude_min ? Number.parseInt(form.altitude_min, 10) : null,
      altitude_max: form.altitude_max ? Number.parseInt(form.altitude_max, 10) : null,
      crop_year: form.crop_year || null,
      score: form.score ? Number.parseFloat(form.score) : null,
      description: form.description || null,
      total_quantity_kg: maxTotal,
      min_commitment_kg: minTotal,
      price_per_kg: basePrice,
      bag_size_kg: bagSizeInt,
      min_bags_to_succeed: minBagsInt,
      expiry_date: form.expiry_date || null,
      commitment_deadline: form.expiry_date || null,
      flavor_notes: form.flavor_notes
        ? form.flavor_notes.split(",").map((s) => s.trim())
        : [],
      certifications: form.certifications
        ? form.certifications.split(",").map((s) => s.trim())
        : [],
      images: [headerImageUrl, ...supportingImages].filter(Boolean),
      status: "active",
      pricing_tiers: tiers.map((t) => ({
        min_quantity_kg: fromDisplayWeight(Number.parseFloat(t.min_quantity_kg), unit),
        price_per_kg: fromDisplayPricePerUnit(Number.parseFloat(t.price_per_kg), unit),
      })),
    };

    let response: Response;
    try {
      response = await fetch("/api/lots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      setFormError("Couldn't save lot. Try again.");
      toast.error("Couldn't save lot. Try again.");
      setIsLoading(false);
      return;
    }

    if (response.status === 201) {
      toast.success("Done. You're good.");
      router.push("/dashboard/seller/lots");
      setIsLoading(false);
      return;
    }

    if (response.status === 400) {
      // 400s carry `{ errors: Record<string, string> }`. Map each entry to the
      // inline error for that field. Falls back to a generic message if the
      // shape is unexpected.
      try {
        const data = (await response.json()) as { errors?: Record<string, string> };
        if (data?.errors && typeof data.errors === "object") {
          setFieldErrors(data.errors);
          toast.error("Fix the highlighted fields and try again.");
          setIsLoading(false);
          return;
        }
      } catch {
        // fall through to generic error
      }
      setFormError("Couldn't save lot. Try again.");
      toast.error("Couldn't save lot. Try again.");
      setIsLoading(false);
      return;
    }

    // Anything else (401, 403, 500, …) — show a top-level error.
    let message = "Couldn't save lot. Try again.";
    try {
      const data = (await response.json()) as { error?: string };
      if (typeof data?.error === "string" && data.error.trim()) {
        message = data.error;
      }
    } catch {
      // ignore — keep generic message
    }
    setFormError(message);
    toast.error(message);
    setIsLoading(false);
  };

  const basePrice = Number.parseFloat(form.price_per_kg) || 0;
  const buyerBasePrice = addPlatformFee(basePrice);
  const minQty = Number.parseFloat(form.min_commitment_kg) || 0;
  const maxQty = Number.parseFloat(form.total_quantity_kg) || 0;

  return (
    <div className="max-w-2xl">
      <Link
        href="/dashboard/seller/lots"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Lots
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Create New Lot</CardTitle>
          <CardDescription>
            List a new green coffee lot with tiered volume pricing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="title">Lot Title *</Label>
                <Input
                  id="title"
                  required
                  placeholder="e.g. Guji Hambella Natural - Lot 47"
                  value={form.title}
                  onChange={(e) => update("title", e.target.value)}
                />
                {fieldErrors.title && (
                  <p className="text-xs font-medium text-destructive">
                    {fieldErrors.title}
                  </p>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="origin_country">Origin Country *</Label>
                  <Input
                    id="origin_country"
                    required
                    placeholder="Ethiopia"
                    value={form.origin_country}
                    onChange={(e) => update("origin_country", e.target.value)}
                  />
                  {fieldErrors.origin_country && (
                    <p className="text-xs font-medium text-destructive">
                      {fieldErrors.origin_country}
                    </p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="region">Region</Label>
                  <Input
                    id="region"
                    placeholder="Guji"
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
                    placeholder="Hambella Estate"
                    value={form.farm}
                    onChange={(e) => update("farm", e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="variety">Variety</Label>
                  <Input
                    id="variety"
                    placeholder="Heirloom"
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
                    placeholder="Natural"
                    value={form.process}
                    onChange={(e) => update("process", e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="crop_year">Crop Year</Label>
                  <Input
                    id="crop_year"
                    placeholder="2025/26"
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
                    placeholder="1800"
                    value={form.altitude_min}
                    onChange={(e) => update("altitude_min", e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="altitude_max">Altitude Max (m)</Label>
                  <Input
                    id="altitude_max"
                    type="number"
                    placeholder="2200"
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
                    placeholder="86.5"
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
                  placeholder="Describe the lot characteristics..."
                  value={form.description}
                  onChange={(e) => update("description", e.target.value)}
                />
              </div>
            </div>

            <Separator />

            {/* Pricing & Quantity Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground">
                Pricing & Quantity
              </h3>
              <p className="text-sm text-muted-foreground">
                Set a minimum total quantity for the sale to trigger, a maximum
                quantity available, and a base price per {unit}. Then add volume
                discount tiers to incentivize larger group purchases.
              </p>
              <p className="text-xs font-medium text-foreground">
                Inputs in this section use {unit.toUpperCase()} and ${`/`}{unit}.
              </p>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="min_commitment_kg">
                    Min Total to Trigger ({unit}) *
                  </Label>
                  <Input
                    id="min_commitment_kg"
                    type="number"
                    required
                    min="1"
                    placeholder="300"
                    value={form.min_commitment_kg}
                    onChange={(e) => update("min_commitment_kg", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Sale triggers when total commitments reach this amount
                  </p>
                  {fieldErrors.min_commitment_kg && (
                    <p className="text-xs font-medium text-destructive">
                      {fieldErrors.min_commitment_kg}
                    </p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="total_quantity_kg">
                    Max Available ({unit}) *
                  </Label>
                  <Input
                    id="total_quantity_kg"
                    type="number"
                    required
                    min="1"
                    placeholder="1000"
                    value={form.total_quantity_kg}
                    onChange={(e) => update("total_quantity_kg", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum quantity you can supply
                  </p>
                  {fieldErrors.total_quantity_kg && (
                    <p className="text-xs font-medium text-destructive">
                      {fieldErrors.total_quantity_kg}
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
                    placeholder="8.50"
                    value={form.price_per_kg}
                    onChange={(e) => update("price_per_kg", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    This is the amount you will receive at the minimum trigger quantity. Buyers will see {basePrice > 0 ? `$${buyerBasePrice.toFixed(2)}/${unit}` : "your price plus 10%"}.
                  </p>
                  {fieldErrors.price_per_kg && (
                    <p className="text-xs font-medium text-destructive">
                      {fieldErrors.price_per_kg}
                    </p>
                  )}
                </div>
              </div>

              {/* Bag config — server-side bag-aware validation lives in
                  /api/lots and surfaces these field errors inline. Always
                  shown in kg regardless of display unit since the route
                  expects integer kg. */}
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
                    value={form.bag_size_kg}
                    onChange={(e) => update("bag_size_kg", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    How big is each bag? Most green coffee ships in 60–69kg bags.
                  </p>
                  {fieldErrors.bag_size_kg && (
                    <p className="text-xs font-medium text-destructive">
                      {fieldErrors.bag_size_kg}
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
                    step="1"
                    placeholder="1"
                    value={form.min_bags_to_succeed}
                    onChange={(e) =>
                      update("min_bags_to_succeed", e.target.value)
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    How many full bags must commit for the campaign to settle? Default: 1.
                  </p>
                  {fieldErrors.min_bags_to_succeed && (
                    <p className="text-xs font-medium text-destructive">
                      {fieldErrors.min_bags_to_succeed}
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

            {/* Volume Discount Tiers */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">
                    Volume Discount Tiers
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Lower the price per {unit} as buyers commit to more total
                    quantity. Each tier&apos;s quantity must be between the
                    minimum trigger and maximum available.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addTier}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add Tier
                </Button>
              </div>

              {/* Base tier preview */}
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Base Tier (minimum)
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {minQty > 0
                        ? `${minQty.toLocaleString()} ${unit}`
                        : "Set minimum above"}
                    </p>
                  </div>
                  <p className="text-lg font-bold text-foreground">
                    {basePrice > 0 ? `$${basePrice.toFixed(2)}/${unit}` : "--"}
                  </p>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Buyers see {basePrice > 0 ? `$${buyerBasePrice.toFixed(2)}/${unit}` : "--"}, which includes the 10% platform fee. You still receive the full base price above.
                </p>
              </div>

              {tiers.map((tier, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border p-4 space-y-3"
                >
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
                      <Label>When total reaches ({unit})</Label>
                      <Input
                        type="number"
                        min={minQty + 1}
                        max={maxQty}
                        placeholder="500"
                        value={tier.min_quantity_kg}
                        onChange={(e) =>
                          updateTier(idx, "min_quantity_kg", e.target.value)
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Price per {unit} ($)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max={basePrice > 0 ? basePrice - 0.01 : undefined}
                        placeholder="7.50"
                        value={tier.price_per_kg}
                        onChange={(e) =>
                          updateTier(idx, "price_per_kg", e.target.value)
                        }
                      />
                    </div>
                  </div>
                  {tier.min_quantity_kg && tier.price_per_kg && (
                    <p className="text-xs text-muted-foreground">
                      If total commitments reach{" "}
                      {Number.parseFloat(tier.min_quantity_kg).toLocaleString()}{" "}
                      {unit}, you receive $
                      {Number.parseFloat(tier.price_per_kg).toFixed(2)}/{unit}
                      and buyers pay $
                      {addPlatformFee(Number.parseFloat(tier.price_per_kg)).toFixed(2)}/{unit}
                    </p>
                  )}
                </div>
              ))}

              {tiers.length === 0 && (
                <p className="text-sm text-muted-foreground italic">
                  No volume discounts yet. Add tiers to incentivize larger group
                  purchases.
                </p>
              )}
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground">Lot Images</h3>
              <p className="text-sm text-muted-foreground">
                Add a header image and supporting images. Images are stored in Supabase Storage and shown to buyers and hubs.
              </p>
              <LotImageUploader
                sellerId={sellerId}
                headerImageUrl={headerImageUrl}
                supportingImages={supportingImages}
                onChange={({ headerImageUrl: nextHeader, supportingImages: nextSupporting }) => {
                  setHeaderImageUrl(nextHeader);
                  setSupportingImages(nextSupporting);
                }}
                disabled={isLoading}
              />
            </div>

            <Separator />

            {/* Flavor & Certifications */}
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="flavor_notes">
                  Flavor Notes (comma separated)
                </Label>
                <Input
                  id="flavor_notes"
                  placeholder="Blueberry, Jasmine, Dark Chocolate"
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
                  placeholder="Organic, Fair Trade, Rainforest Alliance"
                  value={form.certifications}
                  onChange={(e) => update("certifications", e.target.value)}
                />
              </div>
            </div>

            {formError && (
              <div
                role="alert"
                className="rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
              >
                {formError}
              </div>
            )}

            <div className="flex gap-3">
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Brewing..." : "Create Lot"}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/dashboard/seller/lots">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
