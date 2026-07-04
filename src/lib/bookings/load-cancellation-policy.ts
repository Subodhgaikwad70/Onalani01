import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { DEFAULT_CANCELLATION_POLICY_KEY } from "@/lib/bookings/cancellation-policies";

export type PropertyCancellationPolicy = {
  id: string;
  key: string;
  label: string;
  rules: unknown;
};

/** Load cancellation policy for a property (defaults to Super Strict). */
export async function loadPropertyCancellationPolicy(
  admin: SupabaseClient,
  property: { cancellation_policy_id?: string | null },
): Promise<PropertyCancellationPolicy | null> {
  if (property.cancellation_policy_id) {
    const { data } = await admin
      .from("cancellation_policies")
      .select("id, key, label, rules")
      .eq("id", property.cancellation_policy_id)
      .eq("is_active", true)
      .maybeSingle();
    if (data) return data as PropertyCancellationPolicy;
  }

  const { data: fallback } = await admin
    .from("cancellation_policies")
    .select("id, key, label, rules")
    .eq("key", DEFAULT_CANCELLATION_POLICY_KEY)
    .eq("is_active", true)
    .maybeSingle();

  return (fallback as PropertyCancellationPolicy | null) ?? null;
}

/** Load an active policy row by canonical key (guest selection at booking). */
export async function loadCancellationPolicyByKey(
  admin: SupabaseClient,
  key: string,
): Promise<PropertyCancellationPolicy | null> {
  const { data } = await admin
    .from("cancellation_policies")
    .select("id, key, label, rules")
    .eq("key", key)
    .eq("is_active", true)
    .maybeSingle();
  return (data as PropertyCancellationPolicy | null) ?? null;
}

/** Fetch cancellation policy for a listing slug (public, no auth). */
export async function getListingCancellationPolicy(slug: string) {
  const admin = createSupabaseAdmin();
  const { data: listing } = await admin
    .from("listings")
    .select("property_id")
    .eq("slug", slug)
    .maybeSingle();
  if (!listing) return null;

  const { data: property } = await admin
    .from("properties")
    .select("cancellation_policy_id")
    .eq("id", listing.property_id)
    .maybeSingle();
  if (!property) return null;

  return loadPropertyCancellationPolicy(admin, property);
}
