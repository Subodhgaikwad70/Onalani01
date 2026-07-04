import { AdminPropertyDetailClient } from "@/components/admin/admin-property-detail-client";

export const dynamic = "force-dynamic";

export default async function HostPropertyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminPropertyDetailClient id={id} />;
}
