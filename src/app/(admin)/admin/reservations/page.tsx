import { redirect } from "next/navigation";

/** Legacy path — bookings list moved to /admin/bookings. */
export default function AdminReservationsRedirectPage() {
  redirect("/admin/bookings");
}
