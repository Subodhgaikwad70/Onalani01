import { AdminBookingDetailClient } from "@/components/admin/admin-reservation-detail-client";

export const dynamic = "force-dynamic";

export default async function AdminBookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminBookingDetailClient id={id} />;
}
