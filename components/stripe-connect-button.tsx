"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function StripeConnectButton({
  connected,
  roleLabel,
}: {
  connected: boolean;
  roleLabel: "seller" | "hub";
}) {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/stripe/connect/onboard", { method: "POST" });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to start Stripe onboarding");
      }

      const redirectUrl =
        (payload?.dashboard_url as string | undefined) ||
        (payload?.onboarding_url as string | undefined);

      if (!redirectUrl) {
        throw new Error("Stripe redirect URL not returned");
      }

      window.location.href = redirectUrl;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to open Stripe onboarding");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button onClick={handleClick} disabled={isLoading} variant={connected ? "outline" : "default"}>
      {isLoading
        ? "Opening Stripe..."
        : connected
          ? `Manage ${roleLabel} payouts`
          : `Connect Stripe for ${roleLabel} payouts`}
    </Button>
  );
}
