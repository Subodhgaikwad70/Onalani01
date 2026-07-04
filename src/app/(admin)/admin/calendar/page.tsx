import { AdminCalendarClient } from "@/components/admin/admin-calendar-client";

export default function HostCalendarPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-(family-name:--font-lora) text-2xl font-semibold tracking-tight text-[#222222] md:text-3xl">
          Calendar
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[#717171]">
          Month view with reservations, manual blocks, and per-night overrides. Drag to select
          dates and apply pricing or availability rules.
        </p>
      </div>
      <AdminCalendarClient />
    </div>
  );
}
