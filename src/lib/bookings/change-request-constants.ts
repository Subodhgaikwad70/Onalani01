export const CHANGEABLE_BOOKING_STATUSES = [
  "requested",
  "pending_payment",
  "confirmed",
  "in_stay",
] as const;

export type ChangeableBookingStatus = (typeof CHANGEABLE_BOOKING_STATUSES)[number];
