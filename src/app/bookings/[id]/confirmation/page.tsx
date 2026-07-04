import { Suspense } from "react";
import { BookingConfirmationClient } from "@/components/booking/booking-confirmation-client";

export const dynamic = "force-dynamic";

export default async function BookingConfirmationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense
      fallback={
        <p className="mx-auto max-w-6xl px-4 py-16 text-sm text-[#6b7280]">
          Loading confirmation…
        </p>
      }
    >
      <BookingConfirmationClient id={id} />
    </Suspense>
  );
}
