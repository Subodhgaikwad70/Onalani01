import { AdminReviewDetailClient } from "@/components/admin/admin-review-detail-client";

export const dynamic = "force-dynamic";

export default async function AdminReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminReviewDetailClient id={id} />;
}
