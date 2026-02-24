import { createClient } from "@/lib/supabase/server";
import {
  createAccountOnboardingLink,
  createExpressDashboardLoginLink,
  createExpressConnectedAccount,
} from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth/admin";
import { NextResponse } from "next/server";

function isMissingStripeConnectColumn(error: { message?: string } | null) {
  if (!error?.message) return false;
  return error.message.includes("stripe_connect_account_id");
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: existingProfile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, email")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  let profile = existingProfile;

  if (!profile) {
    const fallbackRole = user.user_metadata?.role as
      | "buyer"
      | "seller"
      | "hub_owner"
      | undefined;

    const { data: upserted, error: upsertError } = await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          role: fallbackRole || "buyer",
          email: user.email || null,
          contact_name:
            (user.user_metadata?.full_name as string | undefined) || null,
        },
        { onConflict: "id" }
      )
      .select("id, role, email")
      .single();

    if (upsertError || !upserted) {
      return NextResponse.json(
        { error: upsertError?.message || "Unable to create profile" },
        { status: 500 }
      );
    }

    profile = upserted;
  }

  const isAdmin = isAdminEmail(user.email);

  if (!isAdmin && profile.role !== "seller" && profile.role !== "hub_owner") {
    return NextResponse.json(
      { error: "Only sellers, hub owners, and admin can onboard payouts" },
      { status: 403 }
    );
  }

  const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL;
  if (!origin) {
    return NextResponse.json(
      { error: "Missing request origin and NEXT_PUBLIC_APP_URL" },
      { status: 500 }
    );
  }

  const {
    data: stripeProfile,
    error: stripeProfileError,
  } = await supabase
    .from("profiles")
    .select("stripe_connect_account_id")
    .eq("id", profile.id)
    .maybeSingle();

  if (isMissingStripeConnectColumn(stripeProfileError)) {
    return NextResponse.json(
      {
        error:
          "Stripe Connect is not enabled in the database yet. Run scripts/005_stripe_connect_settlement.sql.",
      },
      { status: 500 }
    );
  }

  if (stripeProfileError) {
    return NextResponse.json({ error: stripeProfileError.message }, { status: 500 });
  }

  let accountId = stripeProfile?.stripe_connect_account_id || null;
  const isExistingAccount = Boolean(accountId);
  if (!accountId) {
    const account = await createExpressConnectedAccount({
      email: profile.email,
      businessType: "company",
    });

    accountId = account.id;

    const { error: persistError } = await supabase
      .from("profiles")
      .update({ stripe_connect_account_id: accountId })
      .eq("id", profile.id);

    if (isMissingStripeConnectColumn(persistError)) {
      return NextResponse.json(
        {
          error:
            "Stripe Connect is not enabled in the database yet. Run scripts/005_stripe_connect_settlement.sql.",
        },
        { status: 500 }
      );
    }

    if (persistError) {
      return NextResponse.json({ error: persistError.message }, { status: 500 });
    }
  }

  if (isAdmin) {
    try {
      const adminClient = createAdminClient();
      const { error: settingsError } = await adminClient
        .from("platform_settings")
        .upsert(
          {
            id: 1,
            platform_connect_account_id: accountId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );

      if (settingsError) {
        throw settingsError;
      }
    } catch {
      return NextResponse.json(
        {
          error:
            "Failed to persist platform payout destination. Run scripts/013_platform_payout_settings.sql.",
        },
        { status: 500 }
      );
    }
  }

  const basePath =
    isAdmin
      ? "/dashboard/admin/payouts"
      : profile.role === "hub_owner"
      ? "/dashboard/hub/payouts"
      : "/dashboard/seller/payouts";
  const returnUrl = `${origin}${basePath}?stripe_connect=return`;
  const refreshUrl = `${origin}${basePath}?stripe_connect=refresh`;

  if (isExistingAccount) {
    const loginLink = await createExpressDashboardLoginLink({ accountId });
    return NextResponse.json(
      { account_id: accountId, dashboard_url: loginLink.url },
      { status: 200 }
    );
  }

  const accountLink = await createAccountOnboardingLink({
    accountId,
    refreshUrl,
    returnUrl,
  });

  return NextResponse.json(
    { account_id: accountId, onboarding_url: accountLink.url },
    { status: 200 }
  );
}
