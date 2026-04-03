"use client";

import React from "react"

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/mernin/Card";
import { Badge } from "@/components/mernin/Badge";
import { Button } from "@/components/mernin/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/mernin/Input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import type { Claim, Commitment, ClaimType } from "@/lib/types";
import { useUnitPreference } from "@/components/unit-provider";
import { formatUnitWeight } from "@/lib/units";

export default function BuyerClaimsPage() {
  const { unit } = useUnitPreference();
  const [claims, setClaims] = useState<(Claim & { commitment?: Commitment })[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    commitment_id: "",
    type: "quality" as ClaimType,
    description: "",
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: c } = await supabase
        .from("commitments")
        .select("*")
        .eq("buyer_id", user.id);
      setCommitments((c as Commitment[]) || []);

      const { data: cl } = await supabase
        .from("claims")
        .select("*")
        .eq("filed_by", user.id)
        .order("created_at", { ascending: false });
      setClaims((cl as Claim[]) || []);
    };
    load();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch("/api/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed to file claim");
      const newClaim = await res.json();
      setClaims((prev) => [newClaim, ...prev]);
      toast.success("Claim filed successfully");
      setOpen(false);
      setForm({ commitment_id: "", type: "quality", description: "" });
    } catch {
      toast.error("Failed to file claim");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Claims</h1>
          <p className="text-sm text-muted-foreground mt-1">Report issues with your commitments.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              File Claim
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>File a Claim</DialogTitle>
              <DialogDescription>
                Report an issue with one of your commitments.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-2">
                <Label>Commitment</Label>
                <Select
                  value={form.commitment_id}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, commitment_id: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select commitment" />
                  </SelectTrigger>
                  <SelectContent>
                    {commitments.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {formatUnitWeight(c.quantity_kg, unit)} {unit} - ${c.total_price}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, type: v as ClaimType }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quality">Quality Issue</SelectItem>
                    <SelectItem value="quantity">Quantity Issue</SelectItem>
                    <SelectItem value="damage">Damage</SelectItem>
                    <SelectItem value="late_delivery">Late Delivery</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Description</Label>
                <Textarea
                  required
                  rows={3}
                  placeholder="Describe the issue..."
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Submitting..." : "Submit Claim"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {claims.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center py-10 px-4">
            <p className="text-sm text-muted-foreground">No claims filed yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {claims.map((cl) => (
            <Card key={cl.id} className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground capitalize">
                      {cl.type.replace("_", " ")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {cl.description}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-xs">
                    {cl.status.replace("_", " ").charAt(0).toUpperCase() +
                      cl.status.replace("_", " ").slice(1)}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {new Date(cl.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
