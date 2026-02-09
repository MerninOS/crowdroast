"use client";

import React from "react"

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Warehouse } from "lucide-react";
import type { Hub } from "@/lib/types";

export default function HubManagementPage() {
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    address: "",
    city: "",
    state: "",
    country: "",
    capacity_kg: "",
  });

  const update = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("hubs")
        .select("*")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });
      setHubs((data as Hub[]) || []);
    };
    load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
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

    const { data, error } = await supabase
      .from("hubs")
      .insert({
        owner_id: user.id,
        name: form.name,
        address: form.address || null,
        city: form.city || null,
        state: form.state || null,
        country: form.country || null,
        capacity_kg: form.capacity_kg ? Number.parseFloat(form.capacity_kg) : 0,
      })
      .select()
      .single();

    if (error) {
      toast.error(error.message);
    } else {
      setHubs((prev) => [data as Hub, ...prev]);
      toast.success("Hub created!");
      setOpen(false);
      setForm({ name: "", address: "", city: "", state: "", country: "", capacity_kg: "" });
    }
    setIsLoading(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">My Hubs</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Hub
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Hub</DialogTitle>
              <DialogDescription>
                Add a new distribution hub.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid gap-2">
                <Label>Hub Name *</Label>
                <Input
                  required
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="e.g. Portland Warehouse"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>City</Label>
                  <Input
                    value={form.city}
                    onChange={(e) => update("city", e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Country</Label>
                  <Input
                    value={form.country}
                    onChange={(e) => update("country", e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Address</Label>
                <Input
                  value={form.address}
                  onChange={(e) => update("address", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Capacity (kg)</Label>
                <Input
                  type="number"
                  value={form.capacity_kg}
                  onChange={(e) => update("capacity_kg", e.target.value)}
                  placeholder="10000"
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Creating..." : "Create Hub"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {hubs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12">
            <Warehouse className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No hubs yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {hubs.map((hub) => {
            const pct =
              hub.capacity_kg > 0
                ? Math.round((hub.used_capacity_kg / hub.capacity_kg) * 100)
                : 0;
            return (
              <Card key={hub.id}>
                <CardHeader>
                  <CardTitle className="text-base">{hub.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {[hub.city, hub.state, hub.country].filter(Boolean).join(", ") || "No location set"}
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Capacity</span>
                    <span className="font-medium">
                      {hub.used_capacity_kg.toLocaleString()} / {hub.capacity_kg.toLocaleString()} kg
                    </span>
                  </div>
                  <Progress value={pct} className="h-2" />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
