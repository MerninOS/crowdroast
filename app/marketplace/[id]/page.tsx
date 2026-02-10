import { redirect } from "next/navigation";

export default async function LotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Lots are now viewed through the buyer dashboard (hub-scoped)
  redirect(`/dashboard`);
}
