import { redirect } from "next/navigation";

/**
 * The AC13 "Your card declined" email links each buyer to
 * `${APP_URL}/dashboard/buyer/commitments/{commitment_id}` (lib/charge-worker.ts).
 * The full commitments dashboard already renders every buyer commit with
 * its lifecycle + needs-attention state, so this page is just a redirect
 * shim that forwards there with the commit id pinned as a hash — the
 * dashboard's existing drawer-open-on-load behavior surfaces the right
 * group automatically. Without this shim the email's URL 404s.
 */
export default async function CommitmentRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard/buyer/commitments#${id}`);
}
