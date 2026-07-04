import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { isAdminRole } from "@/lib/auth/roles";
import { parseJsonBody } from "@/lib/auth/schemas";
import { jsonError } from "@/lib/auth/session";
import { syncBookingToAdminInbox } from "@/lib/messaging/booking-inbox";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  bookingIdentifierLookup,
  bookingPublicIdentifier,
} from "@/lib/bookings/booking-identifiers";

type Params = { id: string; requestId: string };

const bodySchema = z.object({
  reason: z.string().max(2000).optional().nullable(),
});

/** POST /api/bookings/{id}/change-requests/{requestId}/decline — staff decline or guest withdraw. */
export const POST = requireAuth<Params>(async (req, ctx, session) => {
  const { id, requestId } = await ctx.params;
  const { data: body, error } = await parseJsonBody(req, bodySchema);
  if (error) return error;

  const admin = createSupabaseAdmin();
  const lookup = bookingIdentifierLookup(id);
  const { data: booking, error: bookingErr } = await admin
    .from("bookings")
    .select("id, code, guest_id")
    .eq(lookup.column, lookup.value)
    .maybeSingle();
  if (bookingErr) return jsonError(500, bookingErr.message);
  if (!booking) return jsonError(404, "Booking not found");
  const bookingId = booking.id as string;
  const publicBookingId = bookingPublicIdentifier(booking);

  const { data: changeRequest, error: reqErr } = await admin
    .from("booking_change_requests")
    .select("*")
    .eq("id", requestId)
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (reqErr) return jsonError(500, reqErr.message);
  if (!changeRequest) return jsonError(404, "Change request not found");
  if (changeRequest.status !== "pending") {
    return jsonError(409, "Only pending change requests can be declined");
  }

  const isGuest = booking.guest_id === session.user.id;
  const isStaff = isAdminRole(session.role);
  const isOwner = changeRequest.requested_by === session.user.id;
  const isStaffProposal = changeRequest.requested_by_role === "admin";

  if (!isStaff && !(isGuest && (isOwner || isStaffProposal))) {
    return jsonError(403, "Forbidden");
  }

  const withdrawn = isGuest && isOwner && !isStaff;
  const status = withdrawn ? "withdrawn" : "declined";
  const reason =
    body.reason?.trim() ||
    (withdrawn
      ? "Withdrawn by guest"
      : isGuest
        ? "Declined by guest"
        : "Declined by admin");

  const { data: updated, error: updErr } = await admin
    .from("booking_change_requests")
    .update({
      status,
      decline_reason: reason,
      decided_by: session.user.id,
      decided_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .select("*")
    .single();
  if (updErr) return jsonError(400, updErr.message);

  if (!withdrawn && !isGuest) {
    await admin.from("notifications").insert({
      recipient_id: booking.guest_id,
      kind: "change_request_declined",
      title: "Change request not applied",
      body: `Your requested changes for booking ${booking.code} were not approved.${reason ? ` Note: ${reason}` : ""}`,
      link: `/account/trips/${publicBookingId}`,
      payload: { booking_id: booking.id, change_request_id: requestId },
    });
  }

  await syncBookingToAdminInbox(admin, {
    bookingId,
    event: "change_declined",
  });

  return Response.json({ change_request: updated });
});
