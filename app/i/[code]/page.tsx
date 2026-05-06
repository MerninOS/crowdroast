import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { InviteAcceptButton } from "./InviteAcceptButton";

// Bold Mernin' mode landing page. Public — must work for logged-out visitors,
// so we use the service-role client for the invite lookup. Branches by auth
// state to render the right CTA per spec criteria 2, 4, 5.

type InviteData = {
  code: string;
  inviterName: string | null;
  hubId: string;
  hubName: string;
  hubCity: string | null;
};

async function loadInvite(code: string): Promise<InviteData | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("invite_codes")
    .select(
      `
      code, revoked_at,
      hub:hubs!invite_codes_hub_id_fkey(id, name, city),
      inviter:profiles!invite_codes_inviter_user_id_fkey(contact_name)
      `
    )
    .eq("code", code)
    .maybeSingle();

  if (!data || data.revoked_at) return null;
  const hub = data.hub as unknown as { id: string; name: string; city: string | null } | null;
  if (!hub) return null;
  const inviter = data.inviter as unknown as { contact_name: string | null } | null;

  return {
    code: data.code,
    inviterName: inviter?.contact_name ?? null,
    hubId: hub.id,
    hubName: hub.name,
    hubCity: hub.city,
  };
}

async function loadActiveHubMembership(userId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("hub_members")
    .select("hub_id, hub:hubs!hub_members_hub_id_fkey(name)")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (!data) return null;
  const hub = data.hub as unknown as { name: string } | null;
  return { hubId: data.hub_id, hubName: hub?.name ?? "" };
}

export default async function InviteLandingPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const invite = await loadInvite(code);

  if (!invite) {
    return (
      <div className="flex min-h-svh flex-col">
        <SiteHeader />
        <section className="bg-cream flex-1 flex items-center justify-center px-4 py-20 border-t-5 border-espresso">
          <div className="text-center max-w-lg">
            <h1
              className="font-display text-7xl text-cream mb-6"
              style={{
                WebkitTextStroke: "5px #1C0F05",
                paintOrder: "stroke fill",
              }}
            >
              Link's no good
            </h1>
            <p className="text-lg text-espresso/80 font-medium">
              This invite link isn't valid anymore. Ask the friend who sent it for
              a fresh one.
            </p>
          </div>
        </section>
      </div>
    );
  }

  // Determine auth state.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let cta: "logged_out" | "hubless" | "same_hub" | "different_hub";
  let currentHubName: string | null = null;

  if (!user) {
    cta = "logged_out";
  } else {
    const membership = await loadActiveHubMembership(user.id);
    if (!membership) {
      cta = "hubless";
    } else if (membership.hubId === invite.hubId) {
      // Already in this hub — bounce to dashboard.
      redirect("/dashboard");
    } else {
      cta = "different_hub";
      currentHubName = membership.hubName;
    }
  }

  const inviterDisplay = invite.inviterName || "A friend";
  const cityDisplay = invite.hubCity || invite.hubName;

  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />

      {/* ─── HERO ───────────────────────────────────────────────────────── */}
      <section className="bg-tomato px-4 pt-20 pb-16 md:pt-28 md:pb-20 border-b-5 border-espresso">
        <div className="mx-auto max-w-3xl text-center">
          {/* Inviter callout (Mernin' voice) */}
          <div className="inline-block bg-sun border-3 border-espresso rounded-pill px-5 py-1.5 text-xs font-bold uppercase tracking-[0.1em] text-espresso mb-8 shadow-[3px_3px_0_#1C0F05]">
            ✦ {inviterDisplay} sent you here
          </div>

          {/* Sticker hero */}
          <h1
            className="font-display text-cream text-6xl md:text-8xl leading-none mb-2"
            style={{
              WebkitTextStroke: "6px #1C0F05",
              paintOrder: "stroke fill",
            }}
          >
            Join
          </h1>
          <h1
            className="font-display text-cream text-6xl md:text-8xl leading-none mb-10"
            style={{
              WebkitTextStroke: "6px #1C0F05",
              paintOrder: "stroke fill",
            }}
          >
            {invite.hubName}
          </h1>

          {/* In-person pickup notice — required by criterion 2 */}
          <div className="inline-block bg-cream border-3 border-espresso rounded-lg px-6 py-3 mb-10 shadow-[5px_5px_0_#1C0F05] max-w-md">
            <p className="text-espresso text-sm font-bold uppercase tracking-[0.08em]">
              Pickup is in person at {cityDisplay}
            </p>
            <p className="text-espresso/80 text-sm font-medium mt-1">
              Make sure you can grab your coffee at the hub.
            </p>
          </div>

          {/* Branch CTA */}
          <div className="flex flex-col items-center gap-4">
            {cta === "logged_out" && (
              <>
                <Link
                  href={`/auth/sign-up?invite=${encodeURIComponent(invite.code)}`}
                  className="inline-flex items-center gap-2 bg-cream text-espresso border-3 border-espresso rounded-pill px-8 py-3 text-sm font-bold uppercase tracking-[0.1em] shadow-[5px_5px_0_#1C0F05] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[7px_7px_0_#1C0F05] active:translate-x-1 active:translate-y-1 active:shadow-none transition"
                >
                  Sign up to join
                </Link>
                <p className="text-cream/85 text-xs font-medium">
                  Already have an account?{" "}
                  <Link
                    href={`/auth/login?next=${encodeURIComponent(`/i/${invite.code}`)}`}
                    className="underline underline-offset-4 font-bold"
                  >
                    Log in
                  </Link>
                </p>
              </>
            )}

            {cta === "hubless" && (
              <InviteAcceptButton code={invite.code} hubName={invite.hubName} />
            )}

            {cta === "different_hub" && (
              <div className="bg-espresso border-3 border-cream rounded-lg px-6 py-5 max-w-md text-cream text-sm font-medium">
                <p className="font-bold uppercase tracking-[0.08em] mb-2">
                  You're already in {currentHubName ?? "another hub"}
                </p>
                <p>Switching hubs isn't supported yet. Reach out to the team if you
                need to move.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
