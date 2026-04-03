"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/mernin/Card";
import { Badge } from "@/components/mernin/Badge";
import { Button } from "@/components/mernin/Button";
import { Input } from "@/components/mernin/Input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PlatformRole = "buyer" | "seller" | "hub_owner";
type RequestedRole = "seller" | "hub_owner";
type RequestStatus = "pending" | "approved" | "rejected";
type ClaimStatus = "open" | "under_review" | "resolved" | "rejected";
type AdminSection = "roles" | "hubs" | "invites" | "requests" | "claims" | "refunds";

interface ProfileRow {
  id: string;
  email: string | null;
  contact_name: string | null;
  company_name: string | null;
  role: PlatformRole;
  created_at: string;
}

interface InvitationRow {
  id: string;
  email: string;
  target_role: RequestedRole;
  company_name: string | null;
  contact_name: string | null;
  message: string | null;
  status: "pending" | "accepted" | "revoked";
  created_at: string;
}

interface AccessRequestRow {
  id: string;
  user_id: string;
  email: string;
  requested_role: RequestedRole;
  company_name: string | null;
  contact_name: string | null;
  phone: string | null;
  notes: string | null;
  status: RequestStatus;
  reviewed_at: string | null;
  created_at: string;
}

interface ClaimRow {
  id: string;
  commitment_id: string;
  filed_by: string;
  type: string;
  description: string;
  status: ClaimStatus;
  resolution: string | null;
  created_at: string;
  handled_by: string | null;
  handled_at: string | null;
  commitment?: {
    id: string;
    lot_id: string | null;
    total_price: number | null;
    lot?: {
      title: string | null;
    } | null;
  } | null;
  filer?: {
    company_name: string | null;
    contact_name: string | null;
    email: string | null;
  } | null;
}

interface RefundRow {
  id: string;
  status: string;
  payment_status: string;
  total_price: number | null;
  charge_amount_cents: number | null;
  charge_currency: string | null;
  stripe_payment_intent_id: string | null;
  refund_status: "not_refunded" | "partial" | "full" | "failed";
  refunded_amount_cents: number | null;
  refunded_at: string | null;
  refund_reason: string | null;
  created_at: string;
  buyer?: {
    company_name: string | null;
    contact_name: string | null;
    email: string | null;
  } | null;
  lot?: {
    title: string | null;
  } | null;
}

interface HubOwnerOption {
  id: string;
  email: string | null;
  company_name: string | null;
  contact_name: string | null;
}

interface AdminHubRow {
  id: string;
  owner_id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  capacity_kg: number;
  used_capacity_kg: number;
  created_at: string;
  owner?: HubOwnerOption | null;
}

const requestStatusBadgeClass: Record<RequestStatus, string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-900",
  rejected: "bg-rose-100 text-rose-900",
};

const claimStatusBadgeClass: Record<ClaimStatus, string> = {
  open: "bg-amber-100 text-amber-900",
  under_review: "bg-blue-100 text-blue-900",
  resolved: "bg-emerald-100 text-emerald-900",
  rejected: "bg-rose-100 text-rose-900",
};

function formatMoneyFromCents(cents: number, currency: string | null | undefined) {
  const normalizedCurrency = (currency || "usd").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalizedCurrency,
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

function getRemainingRefundableCents(row: RefundRow) {
  const charged = Number(row.charge_amount_cents || 0);
  const refunded = Number(row.refunded_amount_cents || 0);
  return Math.max(0, charged - refunded);
}

export function AdminConsole({
  initialSection = "roles",
}: {
  initialSection?: AdminSection;
}) {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [requests, setRequests] = useState<AccessRequestRow[]>([]);
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [refunds, setRefunds] = useState<RefundRow[]>([]);
  const [hubs, setHubs] = useState<AdminHubRow[]>([]);
  const [hubOwnersList, setHubOwnersList] = useState<HubOwnerOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<RequestedRole>("seller");
  const [inviteCompany, setInviteCompany] = useState("");
  const [inviteContact, setInviteContact] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [isInviteSubmitting, setIsInviteSubmitting] = useState(false);

  const [claimEdits, setClaimEdits] = useState<Record<string, { status: ClaimStatus; resolution: string }>>({});
  const [refundAmountDrafts, setRefundAmountDrafts] = useState<Record<string, string>>({});
  const [activeSection, setActiveSection] = useState<AdminSection>(initialSection);

  const [hubOwnerId, setHubOwnerId] = useState("");
  const [hubName, setHubName] = useState("");
  const [hubAddress, setHubAddress] = useState("");
  const [hubCity, setHubCity] = useState("");
  const [hubState, setHubState] = useState("");
  const [hubCountry, setHubCountry] = useState("");
  const [hubCapacityKg, setHubCapacityKg] = useState("");
  const [isAssigningHub, setIsAssigningHub] = useState(false);

  const counts = useMemo(() => {
    return {
      seller: profiles.filter((p) => p.role === "seller").length,
      hub_owner: profiles.filter((p) => p.role === "hub_owner").length,
      buyer: profiles.filter((p) => p.role === "buyer").length,
      pendingRequests: requests.filter((r) => r.status === "pending").length,
      openClaims: claims.filter((c) => c.status === "open" || c.status === "under_review").length,
      refundableCommitments: refunds.filter((row) => getRemainingRefundableCents(row) > 0).length,
    };
  }, [profiles, requests, claims, refunds]);

  const sellers = useMemo(
    () => profiles.filter((profile) => profile.role === "seller"),
    [profiles]
  );
  const hubOwners = useMemo(
    () => profiles.filter((profile) => profile.role === "hub_owner"),
    [profiles]
  );

  const loadAll = async () => {
    setIsLoading(true);
    try {
      const [profilesRes, hubsRes, invitesRes, requestsRes, claimsRes, refundsRes] = await Promise.all([
        fetch("/api/admin/profiles"),
        fetch("/api/admin/hubs"),
        fetch("/api/admin/invitations"),
        fetch("/api/admin/access-requests"),
        fetch("/api/admin/claims"),
        fetch("/api/admin/refunds"),
      ]);

      if (!profilesRes.ok || !hubsRes.ok || !invitesRes.ok || !requestsRes.ok || !claimsRes.ok || !refundsRes.ok) {
        throw new Error("Failed to load admin data");
      }

      const [profilesData, hubsData, invitesData, requestsData, claimsData, refundsData] = await Promise.all([
        profilesRes.json(),
        hubsRes.json(),
        invitesRes.json(),
        requestsRes.json(),
        claimsRes.json(),
        refundsRes.json(),
      ]);

      setProfiles(profilesData);
      setHubs((hubsData?.hubs || []) as AdminHubRow[]);
      setHubOwnersList((hubsData?.hubOwners || []) as HubOwnerOption[]);
      setInvitations(invitesData);
      setRequests(requestsData);
      setClaims(claimsData);
      setRefunds(refundsData);

      const initialClaimEdits: Record<string, { status: ClaimStatus; resolution: string }> = {};
      for (const claim of claimsData as ClaimRow[]) {
        initialClaimEdits[claim.id] = {
          status: claim.status,
          resolution: claim.resolution || "",
        };
      }
      setClaimEdits(initialClaimEdits);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load admin data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  const updateRole = async (userId: string, role: PlatformRole) => {
    try {
      const res = await fetch("/api/admin/profiles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          role,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to update role");
      }

      setProfiles((prev) => prev.map((row) => (row.id === userId ? { ...row, role } : row)));
      toast.success("Role updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Role update failed");
    }
  };

  const sendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsInviteSubmitting(true);

    try {
      const res = await fetch("/api/admin/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail,
          target_role: inviteRole,
          company_name: inviteCompany,
          contact_name: inviteContact,
          message: inviteMessage,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to send invitation");
      }

      setInvitations((prev) => [payload as InvitationRow, ...prev]);
      setInviteEmail("");
      setInviteCompany("");
      setInviteContact("");
      setInviteMessage("");
      toast.success("Invitation saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invitation failed");
    } finally {
      setIsInviteSubmitting(false);
    }
  };

  const updateRequestStatus = async (requestId: string, status: RequestStatus) => {
    try {
      const res = await fetch("/api/admin/access-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: requestId,
          status,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to update request");
      }

      setRequests((prev) => prev.map((row) => (row.id === requestId ? { ...row, status } : row)));
      if (status === "approved") {
        await loadAll();
      }
      toast.success(`Request ${status}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Request update failed");
    }
  };

  const updateClaimDraft = (claimId: string, patch: Partial<{ status: ClaimStatus; resolution: string }>) => {
    setClaimEdits((prev) => ({
      ...prev,
      [claimId]: {
        status: patch.status ?? prev[claimId]?.status ?? "open",
        resolution: patch.resolution ?? prev[claimId]?.resolution ?? "",
      },
    }));
  };

  const saveClaim = async (claim: ClaimRow) => {
    const edit = claimEdits[claim.id] || { status: claim.status, resolution: claim.resolution || "" };

    if ((edit.status === "resolved" || edit.status === "rejected") && !edit.resolution.trim()) {
      toast.error("Resolution text is required for resolved/rejected claims");
      return;
    }

    try {
      const res = await fetch("/api/admin/claims", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claim_id: claim.id,
          status: edit.status,
          resolution: edit.resolution.trim() || null,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to update claim");
      }

      setClaims((prev) =>
        prev.map((row) =>
          row.id === claim.id
            ? {
                ...row,
                status: edit.status,
                resolution: edit.resolution.trim() || null,
              }
            : row
        )
      );
      toast.success("Claim updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Claim update failed");
    }
  };

  const issueRefund = async (row: RefundRow, mode: "full" | "partial") => {
    const remaining = getRemainingRefundableCents(row);
    if (remaining <= 0) {
      toast.error("No refundable amount remains");
      return;
    }

    let amountCents: number | undefined;
    if (mode === "partial") {
      const draft = refundAmountDrafts[row.id] || "";
      const parsed = Number.parseInt(draft, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        toast.error("Enter a valid partial refund amount in cents");
        return;
      }
      amountCents = parsed;
    }

    try {
      const res = await fetch("/api/admin/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commitment_id: row.id,
          amount_cents: amountCents,
          reason: "requested_by_customer",
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || "Refund failed");
      }

      const updated = payload as RefundRow;
      setRefunds((prev) => prev.map((item) => (item.id === row.id ? updated : item)));
      setRefundAmountDrafts((prev) => ({ ...prev, [row.id]: "" }));
      toast.success("Refund processed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Refund failed");
    }
  };

  const assignHub = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAssigningHub(true);

    try {
      const parsedCapacity = hubCapacityKg.trim()
        ? Number.parseFloat(hubCapacityKg)
        : 0;

      const res = await fetch("/api/admin/hubs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner_id: hubOwnerId,
          name: hubName,
          address: hubAddress,
          city: hubCity,
          state: hubState,
          country: hubCountry,
          capacity_kg: Number.isFinite(parsedCapacity) ? parsedCapacity : 0,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to assign hub");
      }

      setHubs((prev) => [payload as AdminHubRow, ...prev]);
      setHubOwnerId("");
      setHubName("");
      setHubAddress("");
      setHubCity("");
      setHubState("");
      setHubCountry("");
      setHubCapacityKg("");
      toast.success("Hub assigned");
      await loadAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to assign hub");
    } finally {
      setIsAssigningHub(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Admin Console</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Stage 3: role administration, onboarding requests, claim resolution, and manual refunds.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sellers</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{counts.seller}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Hub Owners</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{counts.hub_owner}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Buyers</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{counts.buyer}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pending Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{counts.pendingRequests}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Open Claims</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{counts.openClaims}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Refundable</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{counts.refundableCommitments}</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
      {activeSection === "roles" && (
        <>
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Existing Sellers</CardTitle>
          <CardDescription>Current seller accounts on the platform.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading sellers...</p>
          ) : sellers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sellers found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sellers.map((seller) => (
                  <TableRow key={seller.id}>
                    <TableCell>{seller.company_name || seller.contact_name || "Unnamed Seller"}</TableCell>
                    <TableCell>{seller.email || "No email"}</TableCell>
                    <TableCell>{new Date(seller.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateRole(seller.id, "buyer")}
                      >
                        Remove Seller Access
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Existing Hub Owners</CardTitle>
          <CardDescription>Current hub-owner accounts on the platform.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading hub owners...</p>
          ) : hubOwners.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hub owners found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hubOwners.map((owner) => (
                  <TableRow key={owner.id}>
                    <TableCell>{owner.company_name || owner.contact_name || "Unnamed Hub Owner"}</TableCell>
                    <TableCell>{owner.email || "No email"}</TableCell>
                    <TableCell>{new Date(owner.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateRole(owner.id, "buyer")}
                      >
                        Remove Hub Access
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">User & Role Management</CardTitle>
          <CardDescription>
            Promote buyers to seller or hub owner, or remove elevated access back to buyer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading users...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Current Role</TableHead>
                  <TableHead>Change Role</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((profile) => (
                  <TableRow key={profile.id}>
                    <TableCell>
                      <p className="font-medium text-foreground">
                        {profile.company_name || profile.contact_name || "Unnamed User"}
                      </p>
                      <p className="text-xs text-muted-foreground">{profile.email || "No email"}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {profile.role === "hub_owner" ? "Hub Owner" : profile.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={profile.role}
                        onValueChange={(value) => updateRole(profile.id, value as PlatformRole)}
                      >
                        <SelectTrigger className="w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="buyer">Buyer</SelectItem>
                          <SelectItem value="seller">Seller</SelectItem>
                          <SelectItem value="hub_owner">Hub Owner</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      {(profile.role === "seller" || profile.role === "hub_owner") && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateRole(profile.id, "buyer")}
                        >
                          Remove Elevated Access
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      </>
      )}

      {activeSection === "hubs" && (
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Hub Assignment</CardTitle>
          <CardDescription>
            Assign one hub to each hub owner. Hub owners cannot create their own hubs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={assignHub} className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="hub-owner">Hub Owner</Label>
              <Select value={hubOwnerId} onValueChange={setHubOwnerId}>
                <SelectTrigger id="hub-owner">
                  <SelectValue placeholder="Select a hub owner" />
                </SelectTrigger>
                <SelectContent>
                  {hubOwnersList.map((owner) => (
                    <SelectItem key={owner.id} value={owner.id}>
                      {owner.company_name || owner.contact_name || owner.email || owner.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="hub-name">Hub Name</Label>
              <Input
                id="hub-name"
                required
                value={hubName}
                onChange={(e) => setHubName(e.target.value)}
                placeholder="e.g. Portland Warehouse"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="hub-address">Address</Label>
              <Input
                id="hub-address"
                value={hubAddress}
                onChange={(e) => setHubAddress(e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="hub-city">City</Label>
              <Input
                id="hub-city"
                value={hubCity}
                onChange={(e) => setHubCity(e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="hub-state">State</Label>
              <Input
                id="hub-state"
                value={hubState}
                onChange={(e) => setHubState(e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="hub-country">Country</Label>
              <Input
                id="hub-country"
                value={hubCountry}
                onChange={(e) => setHubCountry(e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="hub-capacity">Capacity (kg)</Label>
              <Input
                id="hub-capacity"
                type="number"
                min="0"
                value={hubCapacityKg}
                onChange={(e) => setHubCapacityKg(e.target.value)}
                placeholder="0"
              />
            </div>

            <div className="md:col-span-2">
              <Button type="submit" disabled={isAssigningHub || !hubOwnerId}>
                {isAssigningHub ? "Assigning..." : "Assign Hub"}
              </Button>
            </div>
          </form>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hub</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hubs.map((hub) => (
                <TableRow key={hub.id}>
                  <TableCell>{hub.name}</TableCell>
                  <TableCell>
                    {hub.owner?.company_name || hub.owner?.contact_name || hub.owner?.email || "Unknown"}
                  </TableCell>
                  <TableCell>
                    {[hub.city, hub.state, hub.country].filter(Boolean).join(", ") || "Not set"}
                  </TableCell>
                  <TableCell>{hub.capacity_kg || 0} kg</TableCell>
                  <TableCell>{new Date(hub.created_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
              {hubs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-muted-foreground">
                    No hubs assigned yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      )}

      {activeSection === "invites" && (
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Invitations</CardTitle>
          <CardDescription>Invite new sellers and hub owners to join the platform.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={sendInvitation} className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="owner@example.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="invite-role">Role</Label>
              <Select
                value={inviteRole}
                onValueChange={(value) => setInviteRole(value as RequestedRole)}
              >
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="seller">Seller</SelectItem>
                  <SelectItem value="hub_owner">Hub Owner</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="invite-company">Company Name</Label>
              <Input
                id="invite-company"
                value={inviteCompany}
                onChange={(e) => setInviteCompany(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="invite-contact">Contact Name</Label>
              <Input
                id="invite-contact"
                value={inviteContact}
                onChange={(e) => setInviteContact(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="invite-message">Message</Label>
              <Textarea
                id="invite-message"
                value={inviteMessage}
                onChange={(e) => setInviteMessage(e.target.value)}
                placeholder="Optional internal note for this invitation"
                rows={3}
              />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={isInviteSubmitting}>
                {isInviteSubmitting ? "Saving..." : "Create Invitation"}
              </Button>
            </div>
          </form>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.map((invitation) => (
                <TableRow key={invitation.id}>
                  <TableCell>{invitation.email}</TableCell>
                  <TableCell>{invitation.target_role === "hub_owner" ? "Hub Owner" : "Seller"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{invitation.status}</Badge>
                  </TableCell>
                  <TableCell>{new Date(invitation.created_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
              {invitations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground">
                    No invitations created yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      )}

      {activeSection === "requests" && (
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Access Requests</CardTitle>
          <CardDescription>
            Requests submitted by buyers who want seller or hub-owner access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading requests...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Requester</TableHead>
                  <TableHead>Requested Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>
                      <p className="font-medium text-foreground">
                        {request.company_name || request.contact_name || request.email}
                      </p>
                      <p className="text-xs text-muted-foreground">{request.email}</p>
                    </TableCell>
                    <TableCell>
                      {request.requested_role === "hub_owner" ? "Hub Owner" : "Seller"}
                    </TableCell>
                    <TableCell>
                      <Badge className={requestStatusBadgeClass[request.status]}>{request.status}</Badge>
                    </TableCell>
                    <TableCell>{new Date(request.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={request.status !== "pending"}
                        onClick={() => updateRequestStatus(request.id, "approved")}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={request.status !== "pending"}
                        onClick={() => updateRequestStatus(request.id, "rejected")}
                      >
                        Reject
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {requests.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-sm text-muted-foreground">
                      No access requests submitted yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      )}

      {activeSection === "claims" && (
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Claims Oversight</CardTitle>
          <CardDescription>
            Review, update, and resolve claims across buyers, hubs, and sellers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading claims...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Claim</TableHead>
                  <TableHead>Filed By</TableHead>
                  <TableHead>Current Status</TableHead>
                  <TableHead>Resolution</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.map((claim) => {
                  const edit = claimEdits[claim.id] || {
                    status: claim.status,
                    resolution: claim.resolution || "",
                  };
                  return (
                    <TableRow key={claim.id}>
                      <TableCell>
                        <p className="font-medium capitalize text-foreground">
                          {claim.type.replace("_", " ")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {claim.commitment?.lot?.title || `Commitment ${claim.commitment_id.slice(0, 8)}`}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">
                          {claim.filer?.company_name || claim.filer?.contact_name || claim.filer?.email || "Unknown"}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-2">
                          <Badge className={claimStatusBadgeClass[claim.status]}>{claim.status}</Badge>
                          <Select
                            value={edit.status}
                            onValueChange={(value) =>
                              updateClaimDraft(claim.id, { status: value as ClaimStatus })
                            }
                          >
                            <SelectTrigger className="w-[160px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="open">Open</SelectItem>
                              <SelectItem value="under_review">Under Review</SelectItem>
                              <SelectItem value="resolved">Resolved</SelectItem>
                              <SelectItem value="rejected">Rejected</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={edit.resolution}
                          onChange={(e) =>
                            updateClaimDraft(claim.id, { resolution: e.target.value })
                          }
                          placeholder="Resolution note (required for resolved/rejected)"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => saveClaim(claim)}>
                          Save
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {claims.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-sm text-muted-foreground">
                      No claims filed yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      )}

      {activeSection === "refunds" && (
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Refund Queue</CardTitle>
          <CardDescription>
            Process full or partial refunds for paid commitments.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading refunds...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Commitment</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead>Charged</TableHead>
                  <TableHead>Refunded</TableHead>
                  <TableHead>Remaining</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {refunds.map((row) => {
                  const charged = Number(row.charge_amount_cents || 0);
                  const refunded = Number(row.refunded_amount_cents || 0);
                  const remaining = getRemainingRefundableCents(row);
                  const currency = row.charge_currency || "usd";

                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <p className="font-medium text-foreground">{row.lot?.title || "Unknown lot"}</p>
                        <p className="text-xs text-muted-foreground">{row.id.slice(0, 8)}</p>
                      </TableCell>
                      <TableCell>
                        {row.buyer?.company_name || row.buyer?.contact_name || row.buyer?.email || "Unknown"}
                      </TableCell>
                      <TableCell>{formatMoneyFromCents(charged, currency)}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p>{formatMoneyFromCents(refunded, currency)}</p>
                          <Badge variant="secondary">{row.refund_status}</Badge>
                        </div>
                      </TableCell>
                      <TableCell>{formatMoneyFromCents(remaining, currency)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={remaining <= 0}
                            onClick={() => issueRefund(row, "full")}
                          >
                            Full Refund
                          </Button>
                          <div className="flex items-center gap-2">
                            <Input
                              value={refundAmountDrafts[row.id] || ""}
                              onChange={(e) =>
                                setRefundAmountDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))
                              }
                              placeholder="cents"
                              className="h-8 w-24"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={remaining <= 0}
                              onClick={() => issueRefund(row, "partial")}
                            >
                              Partial
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {refunds.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-sm text-muted-foreground">
                      No paid commitments available for refunds yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      )}
      </div>
    </div>
  );
}
