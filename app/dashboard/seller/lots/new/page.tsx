"use client";

import React from "react"

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function CreateLotPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
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
    min_commitment_kg: "10",
    price_per_kg: "",
    commitment_deadline: "",
    flavor_notes: "",
    certifications: "",
  });

  const update = (key: string, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

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

    const { error } = await supabase.from("lots").insert({
      seller_id: user.id,
      title: form.title,
      origin_country: form.origin_country,
      region: form.region || null,
      farm: form.farm || null,
      variety: form.variety || null,
      process: form.process || null,
      altitude_min: form.altitude_min ? Number.parseInt(form.altitude_min) : null,
      altitude_max: form.altitude_max ? Number.parseInt(form.altitude_max) : null,
      crop_year: form.crop_year || null,
      score: form.score ? Number.parseFloat(form.score) : null,
      description: form.description || null,
      total_quantity_kg: Number.parseFloat(form.total_quantity_kg),
      min_commitment_kg: Number.parseFloat(form.min_commitment_kg),
      price_per_kg: Number.parseFloat(form.price_per_kg),
      commitment_deadline: form.commitment_deadline || null,
      flavor_notes: form.flavor_notes
        ? form.flavor_notes.split(",").map((s) => s.trim())
        : [],
      certifications: form.certifications
        ? form.certifications.split(",").map((s) => s.trim())
        : [],
      status: "active",
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Lot created successfully!");
      router.push("/dashboard/seller/lots");
    }
    setIsLoading(false);
  };

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
            List a new green coffee lot on the marketplace.
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

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="total_quantity_kg">Total Quantity (kg) *</Label>
                  <Input
                    id="total_quantity_kg"
                    type="number"
                    required
                    min="1"
                    placeholder="1000"
                    value={form.total_quantity_kg}
                    onChange={(e) => update("total_quantity_kg", e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="min_commitment_kg">Min Commitment (kg)</Label>
                  <Input
                    id="min_commitment_kg"
                    type="number"
                    min="1"
                    placeholder="10"
                    value={form.min_commitment_kg}
                    onChange={(e) => update("min_commitment_kg", e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="price_per_kg">Price per kg (USD) *</Label>
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
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="commitment_deadline">Commitment Deadline</Label>
                <Input
                  id="commitment_deadline"
                  type="datetime-local"
                  value={form.commitment_deadline}
                  onChange={(e) =>
                    update("commitment_deadline", e.target.value)
                  }
                />
              </div>

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
