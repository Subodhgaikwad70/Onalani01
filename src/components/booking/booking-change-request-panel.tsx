"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiPost } from "@/lib/api/client";
import { StayDateRangePicker } from "@/components/booking/stay-date-range-picker";
import { CHANGEABLE_BOOKING_STATUSES } from "@/lib/bookings/change-request-constants";
import { formatDate, formatMoney } from "@/lib/format";

export type BookingChangeRequest = {
  id: string;
  status: string;
  check_in: string;
  check_out: string;
  adults: number;
  children: number;
  infants: number;
  pets: number;
  total_cents: number;
  currency: string;
  message: string | null;
  requested_by_role: string;
  created_at: string;
  decline_reason?: string | null;
};

type PreviewQuote = {
  total_cents: number;
  cash_due_cents?: number;
  currency: string;
  current_total_cents: number;
  current_cash_due_cents?: number;
  breakdown: { nights: number };
};

function guestCountLabel(r: {
  adults: number;
  children: number;
  infants?: number;
  pets?: number;
}) {
  const parts = [
    `${r.adults} adult${r.adults === 1 ? "" : "s"}`,
    r.children > 0 ? `${r.children} child${r.children === 1 ? "" : "ren"}` : null,
  ].filter(Boolean);
  return parts.join(", ");
}

function PendingChangeSummary({
  request,
  current,
}: {
  request: BookingChangeRequest;
  current: {
    check_in: string;
    check_out: string;
    adults: number;
    children: number;
    total_cents: number;
    currency: string;
  };
}) {
  return (
    <div className="space-y-2 text-sm">
      <p>
        <span className="text-muted-foreground">Dates: </span>
        {formatDate(current.check_in)} → {formatDate(current.check_out)}
        <span className="mx-1 text-muted-foreground">to</span>
        <span className="font-medium">
          {formatDate(request.check_in)} → {formatDate(request.check_out)}
        </span>
      </p>
      <p>
        <span className="text-muted-foreground">Guests: </span>
        {guestCountLabel(current)}
        <span className="mx-1 text-muted-foreground">→</span>
        <span className="font-medium">{guestCountLabel(request)}</span>
      </p>
      <p>
        <span className="text-muted-foreground">Total due: </span>
        {formatMoney(current.total_cents, current.currency)}
        <span className="mx-1 text-muted-foreground">→</span>
        <span className="font-medium">
          {formatMoney(request.total_cents, request.currency)}
        </span>
      </p>
      {request.message ? (
        <p className="text-muted-foreground">
          Note: {request.message}
        </p>
      ) : null}
    </div>
  );
}

export function BookingChangeRequestPanel({
  bookingId,
  availabilityBookingId,
  bookingStatus,
  listingSlug,
  listingMinNights,
  listingMaxNights,
  current,
  maxGuests,
  variant,
  onUpdated,
}: {
  bookingId: string;
  availabilityBookingId?: string;
  bookingStatus: string;
  listingSlug?: string | null;
  listingMinNights?: number | null;
  listingMaxNights?: number | null;
  current: {
    check_in: string;
    check_out: string;
    adults: number;
    children: number;
    infants: number;
    pets: number;
    guest_notes: string | null;
    total_cents: number;
    currency: string;
  };
  maxGuests?: number | null;
  variant: "guest" | "admin";
  onUpdated?: () => void;
}) {
  const changeable = CHANGEABLE_BOOKING_STATUSES.includes(
    bookingStatus as (typeof CHANGEABLE_BOOKING_STATUSES)[number],
  );

  const [open, setOpen] = useState(false);
  const [checkIn, setCheckIn] = useState(current.check_in);
  const [checkOut, setCheckOut] = useState(current.check_out);
  const [adults, setAdults] = useState(current.adults);
  const [children, setChildren] = useState(current.children);
  const [infants, setInfants] = useState(current.infants);
  const [pets, setPets] = useState(current.pets);
  const [notes, setNotes] = useState(current.guest_notes ?? "");
  const [message, setMessage] = useState("");
  const [applyImmediately, setApplyImmediately] = useState(variant === "admin");
  const [preview, setPreview] = useState<PreviewQuote | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busy, setBusy] = useState<null | "approve" | "decline" | "withdraw">(null);
  const [requests, setRequests] = useState<BookingChangeRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const bookingPathId = encodeURIComponent(bookingId);

  const loadRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const res = await fetch(`/api/bookings/${bookingPathId}/change-requests`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("load");
      const j = (await res.json()) as { change_requests: BookingChangeRequest[] };
      setRequests(j.change_requests ?? []);
    } catch {
      setRequests([]);
    } finally {
      setLoadingRequests(false);
    }
  }, [bookingPathId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRequests();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadRequests]);

  const pending = useMemo(
    () => requests.find((r) => r.status === "pending") ?? null,
    [requests],
  );
  const guestOwnPending = pending?.requested_by_role === "guest";

  const awaitingPayment = useMemo(
    () => requests.find((r) => r.status === "approved_pending_payment") ?? null,
    [requests],
  );

  const resetForm = useCallback(() => {
    setCheckIn(current.check_in);
    setCheckOut(current.check_out);
    setAdults(current.adults);
    setChildren(current.children);
    setInfants(current.infants);
    setPets(current.pets);
    setNotes(current.guest_notes ?? "");
    setMessage("");
    setPreview(null);
    setPreviewError(null);
  }, [current]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) resetForm();
      setOpen(nextOpen);
    },
    [resetForm],
  );

  const handleDatesChange = useCallback((nextCheckIn: string, nextCheckOut: string) => {
    setCheckIn(nextCheckIn);
    setCheckOut(nextCheckOut);
    setPreviewError(null);
  }, []);

  useEffect(() => {
    if (!open || !checkIn || !checkOut || checkOut <= checkIn) {
      queueMicrotask(() => {
        setPreview(null);
        setPreviewError(null);
      });
      return;
    }
    const t = setTimeout(async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const res = await fetch(`/api/bookings/${bookingPathId}/change-requests`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            check_in: checkIn,
            check_out: checkOut,
            guests: { adults, children, infants, pets },
            guest_notes: notes || null,
            preview: true,
          }),
        });
        const j = await res.json();
        if (!res.ok) {
          setPreview(null);
          setPreviewError(
            (j as { error?: { message?: string } })?.error?.message ??
              "These dates are not available",
          );
          return;
        }
        setPreview(j.preview as PreviewQuote);
      } catch {
        setPreview(null);
        setPreviewError("Could not load pricing for these dates");
      } finally {
        setPreviewLoading(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [open, bookingPathId, checkIn, checkOut, adults, children, infants, pets, notes]);

  async function submit() {
    setSubmitting(true);
    try {
      const res = await apiPost<{
        applied: boolean;
        requires_payment?: boolean;
        change_request: BookingChangeRequest;
      }>(`/api/bookings/${bookingPathId}/change-requests`, {
        check_in: checkIn,
        check_out: checkOut,
        guests: { adults, children, infants, pets },
        guest_notes: notes || null,
        message: message.trim() || null,
        apply_immediately: variant === "admin" ? applyImmediately : false,
      });
      if (res.applied) {
        toast.success("Reservation updated");
      } else if (res.requires_payment) {
        toast.success(
          variant === "admin"
            ? "Changes approved — guest must complete payment to confirm"
            : "Change approved — complete payment to confirm your new dates",
        );
      } else {
        toast.success(
          variant === "guest"
            ? "Change request submitted for review"
            : "Change request submitted — approve it to apply",
        );
      }
      setOpen(false);
      await loadRequests();
      onUpdated?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not submit change request");
    } finally {
      setSubmitting(false);
    }
  }

  async function approvePending() {
    if (!pending) return;
    setBusy("approve");
    try {
      const res = await apiPost<{
        requires_payment?: boolean;
        checkout_url?: string | null;
      }>(`/api/bookings/${bookingPathId}/change-requests/${pending.id}/approve`);
      if (res.requires_payment) {
        toast.success("Approved — guest must pay to confirm the new dates");
      } else {
        toast.success("Changes applied to reservation");
      }
      await loadRequests();
      onUpdated?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not approve");
    } finally {
      setBusy(null);
    }
  }

  async function declinePending(asWithdraw: boolean) {
    if (!pending) return;
    setBusy(asWithdraw ? "withdraw" : "decline");
    try {
      await apiPost(
        `/api/bookings/${bookingPathId}/change-requests/${pending.id}/decline`,
        asWithdraw ? { reason: "Withdrawn by guest" } : {},
      );
      toast.success(asWithdraw ? "Change request withdrawn" : "Change request declined");
      await loadRequests();
      onUpdated?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not update request");
    } finally {
      setBusy(null);
    }
  }

  if (!changeable && !pending && !awaitingPayment && !loadingRequests) return null;

  return (
    <section className="rounded-xl border border-[#e2e8e4] bg-white p-5 md:p-6">
      <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-[#6b7280]">
        Modify reservation
      </h2>

      {loadingRequests ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading change requests…</p>
      ) : pending ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/80 p-4">
          <p className="text-sm font-semibold text-amber-950">
            Pending change request
            {pending.requested_by_role === "guest" ? " (from guest)" : " (from staff)"}
          </p>
          <div className="mt-3">
            <PendingChangeSummary request={pending} current={current} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {variant === "admin" ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => void approvePending()}
                >
                  {busy === "approve" ? "Approving…" : "Approve change"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => void declinePending(false)}
                >
                  {busy === "decline" ? "Declining…" : "Decline"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => void declinePending(guestOwnPending)}
                >
                  {guestOwnPending
                    ? busy === "withdraw"
                      ? "Withdrawing…"
                      : "Withdraw request"
                    : busy === "decline"
                      ? "Declining…"
                      : "Decline change"}
                </Button>
              </>
            )}
          </div>
        </div>
      ) : awaitingPayment ? (
        <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50/80 p-4">
          <p className="text-sm font-semibold text-sky-950">
            {variant === "guest"
              ? "Pay to confirm your reservation changes"
              : "Awaiting guest payment to confirm changes"}
          </p>
          <div className="mt-3">
            <PendingChangeSummary request={awaitingPayment} current={current} />
          </div>
          {variant === "guest" ? (
            <Button type="button" size="sm" className="mt-4" asChild>
              <Link href={`/checkout/${bookingPathId}`}>Complete payment</Link>
            </Button>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              The guest was notified to pay the balance at checkout. Changes apply after payment.
            </p>
          )}
        </div>
      ) : changeable ? (
        <p className="mt-2 text-sm text-[#5f6b66]">
          {variant === "guest"
            ? "Request new dates or guest counts. Changes apply after our team approves them."
            : "Propose new trip details for the guest, or apply updates immediately."}
        </p>
      ) : null}

      {changeable && !pending && !awaitingPayment ? (
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="mt-4">
              {variant === "guest" ? "Request changes" : "Change trip details"}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>
                {variant === "guest" ? "Request reservation changes" : "Update trip details"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {listingSlug ? (
                <StayDateRangePicker
                  listingSlug={listingSlug}
                  excludeBookingId={availabilityBookingId ?? bookingId}
                  listingMinNights={listingMinNights}
                  listingMaxNights={listingMaxNights}
                  checkIn={checkIn}
                  checkOut={checkOut}
                  onDatesChange={handleDatesChange}
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="chg-check-in">Check-in</Label>
                    <Input
                      id="chg-check-in"
                      type="date"
                      value={checkIn}
                      onChange={(e) => handleDatesChange(e.target.value, checkOut)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="chg-check-out">Check-out</Label>
                    <Input
                      id="chg-check-out"
                      type="date"
                      value={checkOut}
                      min={checkIn || undefined}
                      onChange={(e) => handleDatesChange(checkIn, e.target.value)}
                    />
                  </div>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="chg-adults">Adults</Label>
                  <Input
                    id="chg-adults"
                    type="number"
                    min={1}
                    max={maxGuests ?? 20}
                    value={adults}
                    onChange={(e) => setAdults(Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="chg-children">Children</Label>
                  <Input
                    id="chg-children"
                    type="number"
                    min={0}
                    max={maxGuests ?? 20}
                    value={children}
                    onChange={(e) => setChildren(Math.max(0, Number(e.target.value) || 0))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="chg-infants">Infants</Label>
                  <Input
                    id="chg-infants"
                    type="number"
                    min={0}
                    value={infants}
                    onChange={(e) => setInfants(Math.max(0, Number(e.target.value) || 0))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="chg-pets">Pets</Label>
                  <Input
                    id="chg-pets"
                    type="number"
                    min={0}
                    value={pets}
                    onChange={(e) => setPets(Math.max(0, Number(e.target.value) || 0))}
                  />
                </div>
              </div>
              {maxGuests != null ? (
                <p className="text-xs text-muted-foreground">Maximum {maxGuests} guests</p>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="chg-notes">Notes for host</Label>
                <Textarea
                  id="chg-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="chg-message">
                  {variant === "guest" ? "Message to host (optional)" : "Internal note (optional)"}
                </Label>
                <Textarea
                  id="chg-message"
                  rows={2}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={
                    variant === "guest"
                      ? "Why you need to change dates or guests…"
                      : "Reason for the change…"
                  }
                />
              </div>
              {variant === "admin" ? (
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={applyImmediately}
                    onChange={(e) => setApplyImmediately(e.target.checked)}
                    className="h-4 w-4 rounded border-border accent-[#1e6a82]"
                  />
                  Apply immediately (skip separate approval)
                </label>
              ) : null}
              <div className="rounded-lg bg-[#f4f6f5] p-3 text-sm">
                {previewLoading ? (
                  <p className="text-muted-foreground">Calculating new total…</p>
                ) : preview ? (
                  <>
                    <p className="font-medium text-[#1f2937]">
                      New total due: {formatMoney(preview.total_cents, preview.currency)}
                    </p>
                    {preview.cash_due_cents != null &&
                    preview.cash_due_cents !== preview.total_cents ? (
                      <p className="text-muted-foreground">
                        Cash due after credits:{" "}
                        {formatMoney(preview.cash_due_cents, preview.currency)}
                      </p>
                    ) : null}
                    <p className="text-muted-foreground">
                      Current: {formatMoney(preview.current_total_cents, preview.currency)}
                      {preview.breakdown?.nights != null
                        ? ` · ${preview.breakdown.nights} night${preview.breakdown.nights === 1 ? "" : "s"}`
                        : ""}
                    </p>
                  </>
                ) : previewError ? (
                  <p className="text-red-600">{previewError}</p>
                ) : (
                  <p className="text-muted-foreground">
                    Select valid available dates to see updated pricing.
                  </p>
                )}
              </div>
              <Button
                type="button"
                className="w-full"
                disabled={submitting || !preview || Boolean(previewError)}
                onClick={() => void submit()}
              >
                {submitting
                  ? "Submitting…"
                  : variant === "admin" && applyImmediately
                    ? "Apply changes"
                    : "Submit change request"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}

      {requests.filter((r) => r.status !== "pending").length > 0 ? (
        <div className="mt-6 border-t border-[#eceeec] pt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-[#9ca3af]">
            Change history
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {requests
              .filter((r) => r.status !== "pending")
              .slice(0, 5)
              .map((r) => (
                <li key={r.id} className="text-[#5f6b66]">
                  <span className="font-medium capitalize text-[#374151]">
                    {r.status.replace(/_/g, " ")}
                  </span>
                  {" · "}
                  {formatDate(r.check_in)} → {formatDate(r.check_out)} ·{" "}
                  {formatMoney(r.total_cents, r.currency)}
                  {" · "}
                  {formatDate(r.created_at)}
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
