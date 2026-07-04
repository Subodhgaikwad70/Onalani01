import { TripDetailClient } from "@/components/account/trip-detail-client";

export const dynamic = "force-dynamic";

export default async function TripPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TripDetailClient id={id} />;
}
