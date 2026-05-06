"use client";

import { useEffect } from "react";

// Fires POST /api/referrals/signup-notify exactly once per dashboard mount.
// The route itself is idempotent (stamps profiles.referral_signup_email_sent_at
// after first run) so even if multiple dashboard sub-routes mount this
// component, the second call short-circuits server-side. No UI.
export function SignupNotifyTrigger() {
  useEffect(() => {
    fetch("/api/referrals/signup-notify", { method: "POST" }).catch(() => undefined);
  }, []);
  return null;
}
