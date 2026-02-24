"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type RequestedRole = "seller" | "hub_owner";

interface AccessRequest {
  id: string;
  requested_role: RequestedRole;
  company_name: string | null;
  contact_name: string | null;
  phone: string | null;
  notes: string | null;
  status: "pending" | "approved" | "rejected";
  reviewed_at: string | null;
  created_at: string;
}

export default function BuyerAccessRequestPage() {
  const [requestedRole, setRequestedRole] = useState<RequestedRole>("seller");
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requests, setRequests] = useState<AccessRequest[]>([]);

  const loadRequests = async () => {
    try {
      const res = await fetch("/api/access-requests");
      if (!res.ok) return;
      const data = await res.json();
      setRequests(data);
    } catch {
      // Ignore on initial paint; user can still submit.
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requested_role: requestedRole,
          company_name: companyName,
          contact_name: contactName,
          phone,
          notes,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || "Unable to submit request");
      }

      setCompanyName("");
      setContactName("");
      setPhone("");
      setNotes("");
      toast.success("Request submitted");
      await loadRequests();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to submit request");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Request Seller or Hub Access
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Buyer signup is open to everyone. Use this form if you need seller or hub-owner permissions.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/buyer">Back to Buyer Dashboard</Link>
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">New Access Request</CardTitle>
          <CardDescription>Admins review these requests from the admin console.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="requested-role">Requested Role</Label>
              <Select
                value={requestedRole}
                onValueChange={(value) => setRequestedRole(value as RequestedRole)}
              >
                <SelectTrigger id="requested-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="seller">Seller</SelectItem>
                  <SelectItem value="hub_owner">Hub Owner</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="company-name">Company Name</Label>
              <Input
                id="company-name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="contact-name">Contact Name</Label>
              <Input
                id="contact-name"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="Tell us about your business and why you need this role."
              />
            </div>

            <div className="md:col-span-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Submitting..." : "Submit Request"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Your Previous Requests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {requests.length === 0 && (
            <p className="text-sm text-muted-foreground">No requests submitted yet.</p>
          )}
          {requests.map((request) => (
            <div
              key={request.id}
              className="flex items-center justify-between rounded-lg border bg-white p-3"
            >
              <div>
                <p className="font-medium text-foreground">
                  {request.requested_role === "hub_owner" ? "Hub Owner" : "Seller"} request
                </p>
                <p className="text-xs text-muted-foreground">
                  Submitted {new Date(request.created_at).toLocaleDateString()}
                </p>
              </div>
              <Badge variant="secondary">{request.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
