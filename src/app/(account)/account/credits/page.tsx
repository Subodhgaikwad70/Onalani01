"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  grantLabel,
  grantRemainingPct,
  grantUsedCents,
  type GuestCreditsResponse,
} from "@/lib/credits/guest-credits";
import { formatDate, formatMoney } from "@/lib/format";

const HISTORY_PAGE_SIZE = 10;

export default function CreditsPage() {
  const [historyPage, setHistoryPage] = useState(1);

  const { data, isPending } = useQuery({
    queryKey: ["credits-full", historyPage],
    queryFn: async () => {
      const params = new URLSearchParams({
        include: "balances,grants,history",
        history_page: String(historyPage),
        history_limit: String(HISTORY_PAGE_SIZE),
      });
      const res = await fetch(`/api/guests/me/credits?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("credits");
      return res.json() as Promise<GuestCreditsResponse>;
    },
    placeholderData: (prev) => prev,
  });
  const historyTotalPages = data?.history_total_pages ?? 1;

  return (
    <div className="space-y-6">
      <h1 className="font-(family-name:--font-lora) text-2xl font-semibold">
        Credits
      </h1>
      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Balances</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(data?.balances ?? {}).map(([cur, cents]) => (
                <p key={cur} className="text-lg font-semibold tabular-nums">
                  {formatMoney(cents, cur)}
                </p>
              ))}
              {Object.keys(data?.balances ?? {}).length === 0 ? (
                <p className="text-sm text-muted-foreground">No active credits.</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Active grants</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {(data?.grants ?? []).map((g) => {
                const used = grantUsedCents(g);
                const pct = grantRemainingPct(g);
                const label = grantLabel(g);
                return (
                  <div key={g.id} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-medium">{label}</p>
                      <p className="tabular-nums font-semibold text-[#143328]">
                        {formatMoney(g.remaining_cents, g.currency)}
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          of {formatMoney(g.original_cents, g.currency)}
                        </span>
                      </p>
                    </div>
                    <Progress value={pct} className="mt-3 h-2" />
                    <p className="mt-2 text-muted-foreground">
                      {formatMoney(g.remaining_cents, g.currency)} remaining
                      {used > 0 ? (
                        <>
                          {" "}
                          · {formatMoney(used, g.currency)} used
                        </>
                      ) : null}
                      {g.expires_at
                        ? ` · expires ${formatDate(g.expires_at)}`
                        : ""}
                    </p>
                  </div>
                );
              })}
              {(data?.grants ?? []).length === 0 ? (
                <p className="text-muted-foreground">No grant rows.</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Utilization history</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {(data?.history ?? []).map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-col gap-1 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-[#1f2937]">
                      {entry.type === "applied" ? "Applied to booking" : "Returned on cancellation"}
                    </p>
                    <p className="text-muted-foreground">
                      {entry.booking_label ?? "Reservation"}
                      {entry.booking_code ? (
                        <>
                          {" "}
                          ·{" "}
                          <span className="font-mono text-xs">{entry.booking_code}</span>
                        </>
                      ) : null}
                    </p>
                    {entry.grant_label && entry.type === "applied" ? (
                      <p className="text-xs text-muted-foreground">
                        From {entry.grant_label}
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      {formatDate(entry.created_at, "en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
                    <p
                      className={
                        entry.type === "refunded"
                          ? "tabular-nums font-semibold text-emerald-700"
                          : "tabular-nums font-semibold text-[#1f2937]"
                      }
                    >
                      {entry.type === "refunded" ? "+" : "−"}
                      {formatMoney(entry.amount_cents, entry.currency)}
                    </p>
                    {entry.booking_code ? (
                      <Link
                        href={`/account/trips/${entry.booking_code}`}
                        className="text-xs font-medium text-[#1d6fb8] hover:underline"
                      >
                        View trip
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))}
              {(data?.history ?? []).length === 0 ? (
                <p className="text-muted-foreground">
                  No credit activity yet. Applied credits will appear here after you book with
                  credits.
                </p>
              ) : null}
              {historyTotalPages > 1 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <p className="text-xs text-muted-foreground">
                    Page {historyPage} of {historyTotalPages}
                    {data?.history_total != null
                      ? ` · ${data.history_total.toLocaleString()} event(s)`
                      : ""}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={historyPage <= 1 || isPending}
                      onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={historyPage >= historyTotalPages || isPending}
                      onClick={() => setHistoryPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
