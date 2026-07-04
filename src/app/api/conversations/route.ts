import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/roles";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { conversationPublicIdentifier } from "@/lib/messaging/conversation-identifiers";

const createConvoBodySchema = z.object({
  recipient_id: z.string().uuid().optional(),
  listing_id: z.string().uuid().optional(),
  booking_id: z.string().uuid().optional(),
  subject: z.string().max(120).optional(),
  initial_message: z.string().min(1).max(4000).optional(),
});

export const GET = requireAuth(async (_req, _ctx, session) => {
  const supabase = await createSupabaseServerClient();
  let query = supabase
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
        total_cents,
        currency,
        adults,
        children,
        listings(
          slug,
          unit_type,
          photos_url,
          roomPhotos_url,
          properties(property_name, photos_url)
        )
      ),
      listing:listings!conversations_listing_id_fkey(
        slug,
        unit_type,
        photos_url,
        roomPhotos_url,
        properties(property_name, photos_url)
      )
    `,
    )
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (!isAdminRole(session.role)) {
    query = query.eq("guest_id", session.user.id);
  }

  const { data, error } = await query;
  if (error) return jsonError(500, error.message);
  return Response.json({ conversations: data ?? [] });
});

/**
 * POST /api/conversations — start (or reuse) a conversation.
 */
export const POST = requireAuth(async (req, _ctx, session) => {
  const { data, error } = await parseJsonBody(req, createConvoBodySchema);
  if (error) return error;

  const admin = createSupabaseAdmin();
  let guestId: string | null = null;
  let adminId: string | null = null;
  const bookingId: string | null = data.booking_id ?? null;
  let bookingCode: string | null = null;
  let listingId: string | null = data.listing_id ?? null;
  let reservationSubject: string | null = null;

  if (data.booking_id) {
    const { data: booking } = await admin
      .from("bookings")
      .select("guest_id, listing_id, code")
      .eq("id", data.booking_id)
      .maybeSingle();
    if (!booking) return jsonError(404, "Booking not found");
    const allowed =
      session.user.id === booking.guest_id || isAdminRole(session.role);
    if (!allowed) return jsonError(403, "Not allowed for this booking");
    guestId = booking.guest_id;
    adminId = isAdminRole(session.role) ? session.user.id : null;
    listingId = booking.listing_id;
    bookingCode = booking.code;
    reservationSubject = `Reservation ${bookingCode}`;
  } else if (data.listing_id) {
    const { data: listing } = await admin
      .from("listings")
      .select("id")
      .eq("id", data.listing_id)
      .maybeSingle();
    if (!listing) return jsonError(404, "Listing not found");
    if (isAdminRole(session.role)) {
      return jsonError(400, "Staff cannot open a listing inquiry as a guest");
    }
    guestId = session.user.id;
    adminId = null;
    listingId = data.listing_id;
    reservationSubject = "Listing inquiry";
  } else if (data.recipient_id) {
    if (data.recipient_id === session.user.id) {
      return jsonError(400, "You cannot message yourself");
    }
    const { data: other } = await admin
      .from("profiles")
      .select("id, role")
      .eq("id", data.recipient_id)
      .maybeSingle();
    if (!other) return jsonError(404, "Recipient not found");
    if (isAdminRole(other.role)) {
      guestId = session.user.id;
      adminId = other.id;
    } else if (isAdminRole(session.role)) {
      guestId = other.id;
      adminId = session.user.id;
    } else {
      guestId = session.user.id;
      adminId = null;
    }
  } else {
    return jsonError(400, "Provide booking_id, listing_id, or recipient_id");
  }

  if (!guestId) return jsonError(400, "Could not derive participants");

  let convo: Record<string, unknown> | null = null;

  if (bookingId) {
    // One thread per reservation — guest and admin share the same conversation.
    const { data: existingForBooking, error: lookupBookingError } = await admin
      .from("conversations")
      .select("*")
      .eq("booking_id", bookingId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (lookupBookingError) return jsonError(500, lookupBookingError.message);

    convo = existingForBooking;

    if (convo && adminId && !convo.admin_id) {
      const { data: assigned, error: assignError } = await admin
        .from("conversations")
        .update({ admin_id: adminId })
        .eq("id", convo.id as string)
        .select("*")
        .single();
      if (assignError) return jsonError(500, assignError.message);
      convo = assigned;
    }
  } else {
    let existingQuery = admin
      .from("conversations")
      .select("*")
      .eq("guest_id", guestId)
      .is("booking_id", null);

    if (listingId) {
      existingQuery = existingQuery.eq("listing_id", listingId);
    }

    if (adminId) {
      existingQuery = existingQuery.eq("admin_id", adminId);
    } else {
      existingQuery = existingQuery.is("admin_id", null);
    }

    const { data: existing } = await existingQuery.maybeSingle();
    convo = existing;
  }

  if (!convo) {
    const { data: row, error: insertError } = await admin
      .from("conversations")
      .insert({
        guest_id: guestId,
        admin_id: adminId,
        listing_id: listingId,
        booking_id: bookingId,
        subject: data.subject ?? reservationSubject ?? (listingId ? "Listing inquiry" : null),
      })
      .select("*")
      .single();
    if (insertError) return jsonError(400, insertError.message);
    convo = row;
  }

  if (!convo) {
    return jsonError(500, "Failed to resolve conversation");
  }

  if (data.initial_message) {
    const { error: msgError } = await admin.from("messages").insert({
      conversation_id: convo.id as string,
      sender_id: session.user.id,
      body: data.initial_message,
    });
    if (msgError) return jsonError(400, msgError.message);
  }

  return Response.json(
    {
      conversation: {
        ...convo,
        public_id: conversationPublicIdentifier({
          id: convo.id as string,
          booking: bookingCode ? { code: bookingCode } : null,
        }),
      },
    },
    { status: 201 },
  );
});
