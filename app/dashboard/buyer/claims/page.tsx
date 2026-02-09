"use client";

import React from "react"

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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

export default function BuyerClaimsPage() {
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Claims</h1>
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
                        {c.quantity_kg}kg - ${c.total_price}
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
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No claims filed yet.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.map((cl) => (
                  <TableRow key={cl.id}>
                    <TableCell className="capitalize font-medium">
                      {cl.type.replace("_", " ")}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {cl.description}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {cl.status.replace("_", " ").charAt(0).toUpperCase() +
                          cl.status.replace("_", " ").slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(cl.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
