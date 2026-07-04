import { PropertyForm } from "@/components/admin/property-form";

export const dynamic = "force-dynamic";

export default async function EditPropertyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PropertyForm mode="edit" propertyId={id} />;
}
