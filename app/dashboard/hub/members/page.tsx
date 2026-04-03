"use client";

import React from "react";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/mernin/Card";
import { Button } from "@/components/mernin/Button";
import { Badge } from "@/components/mernin/Badge";
import { Input } from "@/components/mernin/Input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, UserPlus, Users, Trash2 } from "lucide-react";
import type { Hub, HubMember } from "@/lib/types";

export default function HubMembersPage() {
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [isHubsLoading, setIsHubsLoading] = useState(true);
  const [isMembersLoading, setIsMembersLoading] = useState(false);
  const [selectedHubId, setSelectedHubId] = useState<string>("");
  const [members, setMembers] = useState<(HubMember & { profile?: { company_name: string | null; contact_name: string | null; email: string | null } })[]>([]);
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: myHubs } = await supabase
        .from("hubs")
        .select("*")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });

      const hubList = (myHubs || []) as Hub[];
      setHubs(hubList);
      if (hubList.length > 0) {
        setSelectedHubId(hubList[0].id);
      }
      setIsHubsLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    if (!selectedHubId) return;
    const loadMembers = async () => {
      setIsMembersLoading(true);
      const supabase = createClient();
      const { data } = await supabase
        .from("hub_members")
        .select("*, profile:profiles!hub_members_user_id_fkey(company_name, contact_name, email)")
        .eq("hub_id", selectedHubId)
        .order("joined_at", { ascending: false });

      setMembers((data || []) as any);
      setIsMembersLoading(false);
    };
    loadMembers();
  }, [selectedHubId]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const res = await fetch("/api/hub-members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hub_id: selectedHubId, email: inviteEmail }),
    });

    const result = await res.json();

    if (!res.ok) {
      toast.error(result.error || "Failed to add member");
    } else {
      setMembers((prev) => [result as any, ...prev]);
      toast.success(
        result.status === "active" ? "Buyer added to hub" : "Invitation sent"
      );
      setOpen(false);
      setInviteEmail("");
    }
    setIsLoading(false);
  };

  const handleRemove = async (memberId: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("hub_members")
      .delete()
      .eq("id", memberId);

    if (error) {
      toast.error(error.message);
    } else {
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      toast.success("Member removed");
    }
  };

  const selectedHub = hubs.find((h) => h.id === selectedHubId);
  const statusColors: Record<string, string> = {
    active: "bg-accent/20 text-accent-foreground",
    invited: "bg-yellow-100 text-yellow-800",
    removed: "bg-destructive/10 text-destructive",
  };

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Hub Members</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Invite buyers to your hub. They will only see the lots you curate.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {hubs.length > 1 && (
            <Select value={selectedHubId} onValueChange={setSelectedHubId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select hub" />
              </SelectTrigger>
              <SelectContent>
                {hubs.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" disabled={!selectedHubId}>
                <UserPlus className="mr-2 h-4 w-4" />
                Add Buyer
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Buyer to Hub</DialogTitle>
                <DialogDescription>
                  Enter the buyer&apos;s email address. If they have a CrowdRoast account, they&apos;ll be added immediately. Otherwise, they&apos;ll be sent an invitation.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleInvite} className="space-y-4">
                <div className="grid gap-2">
                  <Label>Email Address *</Label>
                  <Input
                    type="email"
                    required
                    placeholder="buyer@roastery.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Adding..." : "Add to Hub"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {selectedHub && (
        <div className="mb-6 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Managing: <span className="font-medium text-foreground">{selectedHub.name}</span>
          {" "}&middot;{" "}
          {members.filter((m) => m.status === "active").length} active buyer{members.filter((m) => m.status === "active").length !== 1 ? "s" : ""}
        </div>
      )}

      {isHubsLoading || (selectedHubId && isMembersLoading) ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name / Email</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 5 }).map((_, idx) => (
                  <TableRow key={`member-skeleton-${idx}`}>
                    <TableCell>
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="mt-1 h-3 w-32" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-28" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-20 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-8 w-8" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : !selectedHubId ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12">
            <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">Create a hub first to manage members.</p>
          </CardContent>
        </Card>
      ) : members.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12">
            <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No members yet. Add buyers to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name / Email</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <p className="font-medium">
                        {m.profile?.contact_name || m.invited_email || "Unknown"}
                      </p>
                      {m.profile?.email && (
                        <p className="text-xs text-muted-foreground">{m.profile.email}</p>
                      )}
                      {!m.profile?.email && m.invited_email && (
                        <p className="text-xs text-muted-foreground">{m.invited_email}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.profile?.company_name || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[m.status] || ""} variant="secondary">
                        {m.status.charAt(0).toUpperCase() + m.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(m.joined_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleRemove(m.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
