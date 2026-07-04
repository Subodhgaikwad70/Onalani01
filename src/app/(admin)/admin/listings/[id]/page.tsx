import { AdminListingEditor } from "@/components/admin/admin-listing-editor";

export const dynamic = "force-dynamic";

export default async function HostListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminListingEditor listingId={id} />;
}
