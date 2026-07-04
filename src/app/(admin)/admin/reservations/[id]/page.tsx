import { redirect } from "next/navigation";

/** Legacy path — booking detail moved to /admin/bookings/[id]. */
export default async function AdminReservationDetailRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/bookings/${id}`);
}
