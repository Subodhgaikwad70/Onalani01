import { requireAuth } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveConversationReference } from "@/lib/messaging/conversation-identifiers";

type Params = { id: string };

/** GET /api/conversations/{id}/detail */
export const GET = requireAuth<Params>(async (_req, ctx, session) => {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const ref = await resolveConversationReference(supabase, id);
  if (ref.error) return jsonError(500, ref.error.message);
  if (!ref.conversation) return jsonError(404, "Conversation not found");

  const { data: conv, error: convError } = await supabase
    .from("conversations")
    .select(
      `
      *,
      guest:profiles!conversations_guest_id_fkey(id, display_name, avatar_url),
      admin:profiles!conversations_admin_id_fkey(id, display_name, avatar_url),
      booking:bookings!conversations_booking_id_fkey(
        id,
        code,
        status,
        check_in,
        check_out,
        nights,
        adults,
        children,
        infants,
        pets,
        subtotal_cents,
        cleaning_fee_cents,
        extra_guest_fee_cents,
        service_fee_cents,
        taxes_cents,
        credit_applied_cents,
        promo_discount_cents,
        total_cents,
        currency,
        pricing_breakdown,
        listings(
          id,
          slug,
          unit_type,
          photos_url,
          roomPhotos_url,
          unit_description,
          metadata,
          properties(property_name, photos_url)
        )
      ),
      listing:listings!conversations_listing_id_fkey(
        id,
        slug,
        unit_type,
        photos_url,
        roomPhotos_url,
        unit_description,
        metadata,
        properties(property_name, photos_url)
      )
    `,
    )
    .eq("id", ref.conversation.id)
    .maybeSingle();

  if (convError) return jsonError(500, convError.message);
  if (!conv) return jsonError(404, "Conversation not found");

  const row = conv as { guest_id: string; admin_id: string | null };
  const isParticipant =
    row.guest_id === session.user.id ||
    row.admin_id === session.user.id;
  if (!isParticipant && !isAdminRole(session.role)) {
    return jsonError(403, "Forbidden");
  }

  return Response.json({ conversation: conv });
});
