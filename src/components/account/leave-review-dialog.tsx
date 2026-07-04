"use client";

import { useState, type ReactNode } from "react";
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
import { REVIEW_CRITERIA, type ReviewCriterion } from "@/lib/reviews/schemas";

const CRITERION_LABELS: Record<ReviewCriterion, string> = {
  cleanliness: "Cleanliness",
  accuracy: "Accuracy",
  communication: "Communication",
  location: "Location",
  check_in: "Check-in",
  value: "Value",
};

function defaultCriteriaScores(): Record<ReviewCriterion, string> {
  return Object.fromEntries(
    REVIEW_CRITERIA.map((criterion) => [criterion, "5"]),
  ) as Record<ReviewCriterion, string>;
}

export function LeaveReviewDialog({
  bookingId,
  open,
  onOpenChange,
  onSubmitted,
  trigger,
}: {
  bookingId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSubmitted?: () => void;
  trigger?: ReactNode;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [rating, setRating] = useState("5");
  const [reviewBody, setReviewBody] = useState("");
  const [privateFeedback, setPrivateFeedback] = useState("");
  const [criteriaScores, setCriteriaScores] = useState(defaultCriteriaScores);
  const [submitting, setSubmitting] = useState(false);

  const isControlled = open !== undefined;
  const dialogOpen = isControlled ? open : internalOpen;
  const setDialogOpen = isControlled ? (onOpenChange ?? (() => {})) : setInternalOpen;

  async function submitReview() {
    const r = Number(rating);
    if (!Number.isFinite(r) || r < 1 || r > 5) {
      toast.error("Pick a rating 1–5");
      return;
    }
    const invalidCriterion = REVIEW_CRITERIA.find((criterion) => {
      const score = Number(criteriaScores[criterion]);
      return !Number.isInteger(score) || score < 1 || score > 5;
    });
    if (invalidCriterion) {
      toast.error(`Pick a 1–5 score for ${CRITERION_LABELS[invalidCriterion]}`);
      return;
    }
    setSubmitting(true);
    try {
      await apiPost("/api/reviews", {
        booking_id: bookingId,
        subject_type: "listing",
        overall_rating: r,
        public_body: reviewBody.trim() || null,
        private_feedback: privateFeedback.trim() || null,
        criteria: REVIEW_CRITERIA.map((criterion) => ({
          criterion,
          score: Number(criteriaScores[criterion]),
        })),
      });
      toast.success("Thanks for your review");
      setDialogOpen(false);
      setRating("5");
      setReviewBody("");
      setPrivateFeedback("");
      setCriteriaScores(defaultCriteriaScores());
      onSubmitted?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not submit review");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Review your stay</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label>Overall rating</Label>
            <Input
              type="number"
              min={1}
              max={5}
              value={rating}
              onChange={(e) => setRating(e.target.value)}
            />
          </div>
          <div className="space-y-3">
            <div>
              <Label>Rating details</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                These help future guests understand the stay quality.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {REVIEW_CRITERIA.map((criterion) => (
                <div key={criterion} className="space-y-1.5">
                  <Label htmlFor={`criterion-${criterion}`}>
                    {CRITERION_LABELS[criterion]}
                  </Label>
                  <Input
                    id={`criterion-${criterion}`}
                    type="number"
                    min={1}
                    max={5}
                    value={criteriaScores[criterion]}
                    onChange={(e) =>
                      setCriteriaScores((current) => ({
                        ...current,
                        [criterion]: e.target.value,
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Public comment</Label>
            <Textarea
              rows={4}
              value={reviewBody}
              onChange={(e) => setReviewBody(e.target.value)}
              placeholder="Share what stood out about your stay…"
            />
            <p className="text-xs text-muted-foreground">
              This appears publicly after both sides submit reviews or after
              the review window closes.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Private feedback for Onalani</Label>
            <Textarea
              rows={3}
              value={privateFeedback}
              onChange={(e) => setPrivateFeedback(e.target.value)}
              placeholder="Anything our team should fix or follow up on?"
            />
            <p className="text-xs text-muted-foreground">
              This is only visible to the operations team and is not shown on
              the public listing.
            </p>
          </div>
          <Button type="button" onClick={submitReview} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit review"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
