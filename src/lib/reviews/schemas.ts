import { z } from "zod";

export const REVIEW_CRITERIA = [
  "cleanliness",
  "accuracy",
  "communication",
  "location",
  "check_in",
  "value",
] as const;

export type ReviewCriterion = (typeof REVIEW_CRITERIA)[number];

export const createReviewBodySchema = z
  .object({
    booking_id: z.string().uuid(),
    subject_type: z.enum(["listing", "guest"]),
    overall_rating: z.number().int().min(1).max(5),
    public_body: z.string().trim().max(4000).optional().nullable(),
    private_feedback: z.string().trim().max(4000).optional().nullable(),
    criteria: z
      .array(
        z.object({
          criterion: z.enum(REVIEW_CRITERIA),
          score: z.number().int().min(1).max(5),
        }),
      )
      .max(REVIEW_CRITERIA.length)
      .default([]),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    for (const item of data.criteria) {
      if (seen.has(item.criterion)) {
        ctx.addIssue({
          code: "custom",
          path: ["criteria"],
          message: `Duplicate criterion: ${item.criterion}`,
        });
      }
      seen.add(item.criterion);
    }
  });
