import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@merninos/ui";
import { Button } from "@merninos/ui";
import { AlertCircle } from "lucide-react";
import { CampaignLaunchForm } from "./campaign-launch-form";

export default async function CampaignSetupPage() {
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

  if (!profile?.stripe_connect_account_id) {
    return (
      <div className="mx-auto max-w-lg py-8">
        <h1 className="mb-6 font-headline text-3xl text-espresso">
          Launch Campaign
        </h1>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-tomato" />
              Connect Stripe before launching campaigns
            </CardTitle>
            <p className="mt-2 font-body text-sm text-espresso/70">
              We can&apos;t pay out your 2% hub fee on a settled campaign
              without a connected Stripe account, so launching a campaign is
              locked until you finish payout setup.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              <Link href="/dashboard/hub/payouts">Connect Stripe</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/hub/catalog">Back to Catalog</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <Suspense fallback={null}>
      <CampaignLaunchForm />
    </Suspense>
  );
}
