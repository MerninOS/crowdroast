"use client";

import React, { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/mernin/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/mernin/Card";
import { Input } from "@/components/mernin/Input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/mernin/Badge";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Lock, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { LotImageUploader } from "@/components/lot-image-uploader";
import { useUnitPreference } from "@/components/unit-provider";
import {
  fromDisplayPricePerUnit,
  fromDisplayWeight,
  toDisplayPricePerUnit,
  toDisplayWeight,
} from "@/lib/units";
import { addPlatformFee } from "@/lib/pricing";

interface TierRow {
  min_quantity_kg: string;
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
  const [hasCommitments, setHasCommitments] = useState(false);
  const [commitmentCount, setCommitmentCount] = useState(0);
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
    commitment_deadline: "",
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
      setHasCommitments(data.has_commitments);
      setCommitmentCount(data.commitment_count);
      const existingImages = (lot.images || []) as string[];
      setHeaderImageUrl(existingImages[0] || "");
      setSupportingImages(existingImages.slice(1));

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
        total_quantity_kg: lot.total_quantity_kg
          ? toDisplayWeight(lot.total_quantity_kg, unit).toString()
          : "",
        min_commitment_kg: lot.min_commitment_kg
          ? toDisplayWeight(lot.min_commitment_kg, unit).toString()
          : "",
        price_per_kg: lot.price_per_kg
          ? toDisplayPricePerUnit(lot.price_per_kg, unit).toString()
          : "",
        commitment_deadline: lot.commitment_deadline
          ? lot.commitment_deadline.slice(0, 16)
          : "",
        flavor_notes: (lot.flavor_notes || []).join(", "),
        certifications: (lot.certifications || []).join(", "),
      });

      setTiers(
        (data.pricing_tiers || []).map(
          (t: { min_quantity_kg: number; price_per_kg: number }) => ({
            min_quantity_kg: toDisplayWeight(t.min_quantity_kg, unit).toString(),
            price_per_kg: toDisplayPricePerUnit(t.price_per_kg, unit).toString(),
          })
        )
      );
      setInitialLoading(false);
    };
    load();
  }, [id, router, unit]);

  const update = (key: string, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

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

    const res = await fetch(`/api/lots/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        flavor_notes: form.flavor_notes
          ? form.flavor_notes.split(",").map((s) => s.trim())
          : [],
        certifications: form.certifications
          ? form.certifications.split(",").map((s) => s.trim())
          : [],
        images: [headerImageUrl, ...supportingImages].filter(Boolean),
        pricing_tiers: tiers.map((t) => ({
          min_quantity_kg: fromDisplayWeight(Number.parseFloat(t.min_quantity_kg), unit),
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
  const minQty = Number.parseFloat(form.min_commitment_kg) || 0;
  const maxQty = Number.parseFloat(form.total_quantity_kg) || 0;

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

      {hasCommitments && (
        <Card className="mb-6 border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="flex items-start gap-3 pt-6">
            <Lock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Editing Locked</p>
              <p className="text-sm text-muted-foreground mt-1">
                This lot has{" "}
                <span className="font-semibold">
                  {commitmentCount} commitment{commitmentCount !== 1 ? "s" : ""}
                </span>{" "}
                from buyers. You cannot modify a lot once buyers have committed to
                it. This protects the terms buyers agreed to.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <CardTitle>Edit Lot</CardTitle>
            {hasCommitments && (
              <Badge variant="secondary" className="gap-1">
                <Lock className="h-3 w-3" />
                Locked
              </Badge>
            )}
          </div>
          <CardDescription>
            {hasCommitments
              ? "This lot cannot be edited because buyers have already committed."
              : "Update your lot details. Changes will remove this lot from hub catalogs so hub owners can review before re-adding."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <fieldset disabled={hasCommitments} className="space-y-6">
              {!hasCommitments && (
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
                      value={form.min_commitment_kg}
                      onChange={(e) =>
                        update("min_commitment_kg", e.target.value)
                      }
                    />
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
                      value={form.total_quantity_kg}
                      onChange={(e) =>
                        update("total_quantity_kg", e.target.value)
                      }
                    />
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

                <div className="grid gap-2">
                  <Label htmlFor="commitment_deadline">
                    Commitment Deadline *
                  </Label>
                  <Input
                    id="commitment_deadline"
                    type="datetime-local"
                    required
                    value={form.commitment_deadline}
                    onChange={(e) =>
                      update("commitment_deadline", e.target.value)
                    }
                  />
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
                      Lower the price per {unit} at higher total quantities.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addTier}
                    disabled={hasCommitments}
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
                    Buyers see {basePrice > 0 ? `$${buyerBasePrice.toFixed(2)}/${unit}` : "--"}, including the 10% platform fee. You still receive the full base price above.
                  </p>
                </div>

                {tiers.map((tier, idx) => (
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
                        <Label>When total reaches ({unit})</Label>
                        <Input
                          type="number"
                          min={minQty + 1}
                          max={maxQty}
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
                    {tier.min_quantity_kg && tier.price_per_kg && (
                      <p className="text-xs text-muted-foreground">
                        At this tier, you receive $
                        {Number.parseFloat(tier.price_per_kg).toFixed(2)}/{unit}
                        and buyers pay $
                        {addPlatformFee(Number.parseFloat(tier.price_per_kg)).toFixed(2)}/{unit}.
                      </p>
                    )}
                  </div>
                ))}

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
                  disabled={hasCommitments || isLoading}
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

            {!hasCommitments && (
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
