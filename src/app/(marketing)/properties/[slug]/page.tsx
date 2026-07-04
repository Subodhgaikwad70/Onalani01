import { PropertyDetail } from "@/components/property-detail";

export const dynamic = "force-dynamic";

export default async function PropertyAtListingPathPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PropertyDetail slug={slug} />;
}
