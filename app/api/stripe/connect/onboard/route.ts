import { createClient } from "@/lib/supabase/server";
import {
  createAccountOnboardingLink,
  createExpressConnectedAccount,
} from "@/lib/stripe";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, email, stripe_connect_account_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  if (profile.role !== "seller" && profile.role !== "hub_owner") {
    return NextResponse.json(
      { error: "Only sellers and hub owners can onboard payouts" },
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

  let accountId = profile.stripe_connect_account_id as string | null;
  if (!accountId) {
    const account = await createExpressConnectedAccount({
      email: profile.email,
      businessType: "company",
    });

    accountId = account.id;

    await supabase
      .from("profiles")
      .update({ stripe_connect_account_id: accountId })
      .eq("id", profile.id);
  }

  const basePath =
    profile.role === "hub_owner"
      ? "/dashboard/hub/payouts"
      : "/dashboard/seller/payouts";
  const returnUrl = `${origin}${basePath}?stripe_connect=return`;
  const refreshUrl = `${origin}${basePath}?stripe_connect=refresh`;

  const accountLink = await createAccountOnboardingLink({
    accountId,
    refreshUrl,
    returnUrl,
  });

  return NextResponse.json({ account_id: accountId, onboarding_url: accountLink.url }, { status: 200 });
}
