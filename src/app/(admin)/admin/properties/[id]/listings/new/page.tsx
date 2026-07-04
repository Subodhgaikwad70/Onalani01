import { CreateListingWizard } from "@/components/admin/create-listing-wizard";

export const dynamic = "force-dynamic";

export default async function HostNewListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CreateListingWizard propertyId={id} />;
}
