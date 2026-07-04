import { ComplaintDetailClient } from "@/components/admin/complaint-detail-client";

export const dynamic = "force-dynamic";

export default async function AdminComplaintDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ComplaintDetailClient id={id} />;
}
