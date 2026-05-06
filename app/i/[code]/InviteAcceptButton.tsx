"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function InviteAcceptButton({ code, hubName }: { code: string; hubName: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/invite-codes/${encodeURIComponent(code)}/accept`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body?.error === "different_hub_active") {
          setError(
            `You're already in ${body.currentHubName ?? "another hub"}. Switching hubs isn't supported yet.`
          );
        } else if (body?.error === "self_invite_not_allowed") {
          setError("That's your own invite link.");
        } else {
          setError(body?.error || "Couldn't join. Try again in a moment.");
        }
        setSubmitting(false);
        return;
      }
      router.push("/dashboard");
    } catch {
      setError("Couldn't join. Try again in a moment.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={handleAccept}
        disabled={submitting}
        className="inline-flex items-center gap-2 bg-cream text-espresso border-3 border-espresso rounded-pill px-8 py-3 text-sm font-bold uppercase tracking-[0.1em] shadow-[5px_5px_0_#1C0F05] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[7px_7px_0_#1C0F05] active:translate-x-1 active:translate-y-1 active:shadow-none transition disabled:opacity-60"
      >
        {submitting ? "Joining..." : `Join ${hubName}`}
      </button>
      {error && (
        <p className="text-cream bg-espresso/80 border-2 border-cream rounded-md px-3 py-2 text-xs font-medium">
          {error}
        </p>
      )}
    </div>
  );
}
