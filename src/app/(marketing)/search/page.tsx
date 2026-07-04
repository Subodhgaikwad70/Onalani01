import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchPageParams = {
  q?: string | string[];
  from?: string | string[];
  to?: string | string[];
  guests?: string | string[];
  location?: string | string[];
  checkin?: string | string[];
  checkout?: string | string[];
  adults?: string | string[];
  children?: string | string[];
};

function readParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

/** Legacy /search URLs redirect to the properties browse page. */
export default async function SearchRedirectPage({
  searchParams,
}: {
  searchParams?: Promise<SearchPageParams>;
}) {
  const resolved = searchParams ? await searchParams : {};
  const out = new URLSearchParams();

  const location =
    readParam(resolved.location) || readParam(resolved.q);
  const checkin = readParam(resolved.checkin) || readParam(resolved.from);
  const checkout = readParam(resolved.checkout) || readParam(resolved.to);
  const adults = readParam(resolved.adults) || readParam(resolved.guests);
  const children = readParam(resolved.children);

  if (location) out.set("location", location);
  if (checkin) out.set("checkin", checkin);
  if (checkout) out.set("checkout", checkout);
  if (adults) out.set("adults", adults);
  if (children) out.set("children", children);

  const query = out.toString();
  redirect(query ? `/properties?${query}` : "/properties");
}
