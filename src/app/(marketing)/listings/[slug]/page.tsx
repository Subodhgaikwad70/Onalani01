import { ListingDetail } from "@/components/listing-detail";

export const dynamic = "force-dynamic";

export default async function ListingAtSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ListingDetail slug={slug} />;
}
