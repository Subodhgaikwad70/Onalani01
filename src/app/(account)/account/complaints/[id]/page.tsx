import { ComplaintDetailClient } from "@/components/account/complaint-detail-client";

export const dynamic = "force-dynamic";

export default async function ComplaintDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ComplaintDetailClient id={id} />;
}
