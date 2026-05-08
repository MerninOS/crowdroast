import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@merninos/ui";
import { Button } from "@merninos/ui";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { CreateLotForm } from "./create-lot-form";

export default async function CreateLotPage() {
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
      <div className="max-w-2xl">
        <Link
          href="/dashboard/seller/lots"
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Lots
        </Link>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-tomato" />
              Connect Stripe before creating lots
            </CardTitle>
            <CardDescription>
              We can&apos;t pay you out for a settled lot without a connected
              Stripe account, so lot creation is locked until you finish payout
              setup.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              <Link href="/dashboard/seller/payouts">Connect Stripe</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/seller/lots">Cancel</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <CreateLotForm />;
}
