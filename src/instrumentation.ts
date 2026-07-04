export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  if (typeof setInterval === "undefined") return;

  const { startBeds24AvailabilityCacheScheduler } = await import(
    "@/lib/beds24/availability-scheduler"
  );
  startBeds24AvailabilityCacheScheduler();
}
