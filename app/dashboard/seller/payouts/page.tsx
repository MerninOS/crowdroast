import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/mernin/Card";
import { Badge } from "@/components/mernin/Badge";
import { StripeConnectButton } from "@/components/stripe-connect-button";
import { AlertCircle, CheckCircle2, DollarSign } from "lucide-react";

export default async function SellerPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ stripe_connect?: string }>;
}) {
  const { stripe_connect } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_connect_account_id")
    .eq("id", user.id)
    .single();

  const connected = Boolean(profile?.stripe_connect_account_id);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Seller Payouts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect Stripe to receive your 90% share when lots settle after deadline.
        </p>
      </div>

      {stripe_connect === "return" && (
        <Card className="border-emerald-200 bg-emerald-50/60">
          <CardContent className="flex items-center gap-2 p-4 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4" />
            Stripe returned you to CrowdRoast. If setup is complete, payouts are now enabled.
          </CardContent>
        </Card>
      )}

      {stripe_connect === "refresh" && (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="flex items-center gap-2 p-4 text-sm text-amber-800">
            <AlertCircle className="h-4 w-4" />
            Stripe onboarding expired before completion. Restart onboarding below.
          </CardContent>
        </Card>
      )}

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Stripe Connect Account
            </span>
            <Badge variant={connected ? "default" : "secondary"}>
              {connected ? "Connected" : "Not Connected"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Buyer funds are charged when they commit and held until deadline; on settlement, CrowdRoast transfers 90% to your connected account.
          </p>
          <StripeConnectButton connected={connected} roleLabel="seller" />
        </CardContent>
      </Card>
    </div>
  );
}
