"use client";

import React, { useEffect, useState } from "react";
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

export default function CreateLotPage() {
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
    commitment_deadline: "",
    flavor_notes: "",
    certifications: "",
  });

  const [tiers, setTiers] = useState<TierRow[]>([]);

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
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Not authenticated");
      setIsLoading(false);
      return;
    }

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

    const { data: lot, error } = await supabase
      .from("lots")
      .insert({
        seller_id: user.id,
        title: form.title,
        origin_country: form.origin_country,
        region: form.region || null,
        farm: form.farm || null,
        variety: form.variety || null,
        process: form.process || null,
        altitude_min: form.altitude_min
          ? Number.parseInt(form.altitude_min)
          : null,
        altitude_max: form.altitude_max
          ? Number.parseInt(form.altitude_max)
          : null,
        crop_year: form.crop_year || null,
        score: form.score ? Number.parseFloat(form.score) : null,
        description: form.description || null,
        total_quantity_kg: maxTotal,
        min_commitment_kg: minTotal,
        price_per_kg: basePrice,
        commitment_deadline: form.commitment_deadline || null,
        flavor_notes: form.flavor_notes
          ? form.flavor_notes.split(",").map((s) => s.trim())
          : [],
        certifications: form.certifications
          ? form.certifications.split(",").map((s) => s.trim())
          : [],
        images: [headerImageUrl, ...supportingImages].filter(Boolean),
        status: "active",
      })
      .select("id")
      .single();

    if (error || !lot) {
      toast.error(error?.message || "Failed to create lot");
      setIsLoading(false);
      return;
    }

    // Insert pricing tiers
    if (tiers.length > 0) {
      const tierRows = tiers.map((t) => ({
        lot_id: lot.id,
        min_quantity_kg: fromDisplayWeight(Number.parseFloat(t.min_quantity_kg), unit),
        price_per_kg: fromDisplayPricePerUnit(Number.parseFloat(t.price_per_kg), unit),
      }));
      const { error: tierError } = await supabase
        .from("pricing_tiers")
        .insert(tierRows);
      if (tierError) {
        toast.error("Lot created but failed to save tiers: " + tierError.message);
      }
    }

    toast.success("Lot created successfully!");
    router.push("/dashboard/seller/lots");
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
                <p className="text-xs text-muted-foreground">
                  The sale triggers (or cancels) at this deadline
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

            <div className="flex gap-3">
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Creating..." : "Create Lot"}
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
