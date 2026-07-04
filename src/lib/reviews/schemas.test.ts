import { describe, expect, it } from "vitest";
import { createReviewBodySchema } from "./schemas";

const baseReview = {
  booking_id: "11111111-1111-4111-8111-111111111111",
  subject_type: "listing",
  overall_rating: 5,
};

describe("createReviewBodySchema", () => {
  it("accepts criteria and private feedback", () => {
    const parsed = createReviewBodySchema.safeParse({
      ...baseReview,
      public_body: "Great stay",
      private_feedback: "The team should check the patio light.",
      criteria: [
        { criterion: "cleanliness", score: 5 },
        { criterion: "communication", score: 4 },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects duplicate criteria and invalid ratings", () => {
    expect(
      createReviewBodySchema.safeParse({
        ...baseReview,
        overall_rating: 6,
      }).success,
    ).toBe(false);

    expect(
      createReviewBodySchema.safeParse({
        ...baseReview,
        criteria: [
          { criterion: "value", score: 5 },
          { criterion: "value", score: 4 },
        ],
      }).success,
    ).toBe(false);
  });
});
