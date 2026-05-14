"use client";

import { useState } from "react";
import { Button } from "@merninos/ui";

export interface UpdatePaymentButtonProps {
  commitmentId: string;
}

/**
 * Client-side "Update payment" affordance for the bag-aware needs-attention
 * surface. POSTs to `/api/commitments/[id]/restart-setup`, then redirects
 * the buyer to the Stripe-hosted setup session returned by the route.
 * When the buyer completes setup, the Stripe webhook (a) writes the new PM
 * onto the commit and (b) re-arms any terminal `payment_failed` bag rows
 * via `lib/bag-charge-rearm.ts` — the worker then retries them with the
 * new card on the next cron tick.
 *
 * Embedded inside the otherwise server-rendered `NeedsAttentionCard` so
 * the surrounding layout stays a server component.
 */
export function UpdatePaymentButton({ commitmentId }: UpdatePaymentButtonProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/commitments/${commitmentId}/restart-setup`,
        { method: "POST" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Couldn't start the update (${res.status})`);
      }
      const { url } = (await res.json()) as { url: string };
      // Stripe-hosted Checkout — full-page redirect so cookies/session
      // round-trip cleanly. `window.location.href` is the documented
      // pattern in Stripe's docs for this flow.
      window.location.href = url;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went sideways. Try again in a sec."
      );
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-1 self-stretch sm:self-auto">
      <Button
        type="button"
        size="sm"
        variant="default"
        onClick={handleClick}
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? "Opening Stripe…" : "Update payment →"}
      </Button>
      {error ? (
        <span
          className="font-headline text-[11px] font-bold text-tomato"
          role="alert"
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}
