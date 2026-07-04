"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiPost } from "@/lib/api/client";
import { formatDate } from "@/lib/format";
import {
  adminReviewBooking,
  adminReviewListing,
  adminReviewListingTitle,
  type AdminReviewDetail,
  type AdminReviewResponse,
} from "@/lib/reviews/admin-types";

function reviewResponse(
  raw: AdminReviewDetail["review_responses"],
): AdminReviewResponse | null {
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] ?? null : raw;
}

export function AdminReviewDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const [row, setRow] = useState<AdminReviewDetail | null>(null);
  const [rating, setRating] = useState("5");
  const [privateFeedback, setPrivateFeedback] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [responseBody, setResponseBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [responding, setResponding] = useState(false);

  async function loadReview() {
    const res = await fetch(`/api/admin/reviews/${id}`, { credentials: "include" });
    if (!res.ok) throw new Error("review");
    const j = (await res.json()) as { review: AdminReviewDetail };
    const review = j.review;
    setRow(review);
    setRating(String(review.overall_rating));
    setPrivateFeedback(review.private_feedback ?? "");
    setIsPublished(review.is_published);
    setResponseBody(reviewResponse(review.review_responses)?.body ?? "");
  }

  useEffect(() => {
    void loadReview().catch(() => toast.error("Could not load review"));
  }, [id]);

  async function saveReview() {
    const overallRating = Number(rating);
    if (!Number.isFinite(overallRating) || overallRating < 1 || overallRating > 5) {
      toast.error("Rating must be between 1 and 5");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/reviews/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          overall_rating: overallRating,
          private_feedback: privateFeedback.trim() || null,
          is_published: isPublished,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? "Update failed");
      }
      toast.success("Review updated");
      await loadReview();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveResponse() {
    if (!responseBody.trim()) {
      toast.error("Write a response");
      return;
    }
    setResponding(true);
    try {
      await apiPost(`/api/reviews/${id}/response`, { body: responseBody.trim() });
      toast.success("Response saved");
      await loadReview();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save response");
    } finally {
      setResponding(false);
    }
  }

  if (!row) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-32 rounded bg-muted" />
        <div className="h-64 rounded-xl bg-muted" />
      </div>
    );
  }

  const booking = adminReviewBooking(row);
  const listing = adminReviewListing(row);
  const listingTitle = adminReviewListingTitle(row);
  const response = reviewResponse(row.review_responses);

  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild>
        <Link href="/admin/reviews">← All reviews</Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>{listingTitle}</CardTitle>
          <CardDescription>
            Review by {row.author?.display_name?.trim() || "Guest"} · ★ {row.overall_rating}
            {row.published_at ? ` · Published ${formatDate(row.published_at)}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Booking
              </p>
              <p className="mt-1 font-mono">{booking?.code ?? "—"}</p>
              {booking ? (
                <p className="mt-1 text-muted-foreground">
                  {formatDate(booking.check_in)} → {formatDate(booking.check_out)}
                </p>
              ) : null}
              {booking ? (
                <Link
                  href={`/admin/bookings/${row.booking_id}`}
                  className="mt-2 inline-block text-primary hover:underline"
                >
                  View reservation
                </Link>
              ) : null}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Listing
              </p>
              {listing?.slug ? (
                <Link
                  href={`/listings/${listing.slug}`}
                  className="mt-1 inline-block text-primary hover:underline"
                >
                  {listingTitle}
                </Link>
              ) : (
                <p className="mt-1">{listingTitle}</p>
              )}
            </div>
          </div>

          {row.review_criteria_scores?.length ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Criteria scores
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {row.review_criteria_scores.map((score) => (
                  <span
                    key={score.criterion}
                    className="rounded-full border border-border px-3 py-1 text-xs"
                  >
                    {score.criterion.replace(/_/g, " ")} · {score.score}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Guest review</CardTitle>
          <CardDescription>
            Submitted by {row.author?.display_name?.trim() || "Guest"}. Public comments cannot be
            edited by staff.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="whitespace-pre-line rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm leading-relaxed">
            {row.public_body?.trim() || "No public comment provided."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Moderate review</CardTitle>
          <CardDescription>
            Control visibility or update private feedback. Guest public comments are read-only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
            <div>
              <p className="font-medium">Published on listing page</p>
              <p className="text-sm text-muted-foreground">
                Unpublished reviews stay hidden from guests browsing the listing.
              </p>
            </div>
            <Switch checked={isPublished} onCheckedChange={setIsPublished} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="review-rating">Overall rating</Label>
            <Input
              id="review-rating"
              type="number"
              min={1}
              max={5}
              value={rating}
              onChange={(e) => setRating(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="review-private">Private feedback (guest → host only)</Label>
            <Textarea
              id="review-private"
              rows={4}
              value={privateFeedback}
              onChange={(e) => setPrivateFeedback(e.target.value)}
            />
          </div>

          <Button type="button" onClick={saveReview} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </CardContent>
      </Card>

      {row.subject_type === "listing" ? (
        <Card>
          <CardHeader>
            <CardTitle>Host response</CardTitle>
            <CardDescription>
              Public reply shown beneath the guest review on the listing page.
              {response?.responder?.display_name
                ? ` Last updated by ${response.responder.display_name}.`
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              rows={4}
              value={responseBody}
              onChange={(e) => setResponseBody(e.target.value)}
              placeholder="Thank the guest or address their feedback…"
            />
            <Button type="button" onClick={saveResponse} disabled={responding}>
              {responding ? "Saving…" : response ? "Update response" : "Post response"}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
