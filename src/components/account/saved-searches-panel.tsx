"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin, X } from "lucide-react";
import { toast } from "sonner";
import {
  getSavedSearchDisplay,
  savedSearchResultsHref,
} from "@/lib/saved-searches/display";
import { cn } from "@/lib/utils";

type SavedSearch = {
  id: string;
  name: string | null;
  query: Record<string, unknown>;
  alerts_enabled: boolean;
};

async function fetchSavedSearches(): Promise<SavedSearch[]> {
  const res = await fetch("/api/guests/me/saved-searches", {
    credentials: "include",
  });
  if (!res.ok) throw new Error("saved");
  const json = (await res.json()) as { saved_searches: SavedSearch[] };
  return json.saved_searches ?? [];
}

export function SavedSearchesPanel({ className }: { className?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: rows = [], isPending, isError, refetch } = useQuery({
    queryKey: ["saved-searches"],
    queryFn: fetchSavedSearches,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/guests/me/saved-searches/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("delete");
    },
    onMutate: (id) => {
      queryClient.setQueryData<SavedSearch[]>(["saved-searches"], (old) =>
        (old ?? []).filter((s) => s.id !== id),
      );
    },
    onError: () => {
      toast.error("Could not remove saved search");
      void refetch();
    },
  });

  return (
    <section className={cn("w-full space-y-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[#6b7280]">
          Tap a saved search to reopen results with your filters applied.
        </p>
        <Link
          href="/properties"
          className="text-sm font-semibold text-[#1d6fb8] hover:underline"
        >
          New search
        </Link>
      </div>

      {isPending ? (
        <div className="flex items-center gap-2 py-8 text-[13px] text-[#717171]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : isError ? (
        <p className="text-[13px] text-[#717171]">
          Could not load saved searches.{" "}
          <button
            type="button"
            className="font-medium text-[#222222] underline"
            onClick={() => void refetch()}
          >
            Retry
          </button>
        </p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-[#DDDDDD] bg-[#F7F7F7] px-5 py-10 text-center">
          <MapPin className="mx-auto h-5 w-5 text-[#717171]" aria-hidden />
          <p className="mt-3 text-[14px] font-medium text-[#222222]">
            No saved searches yet
          </p>
          <p className="mt-1 text-[13px] text-[#717171]">
            Save a destination and dates from the stays search page.
          </p>
          <Link
            href="/properties"
            className="mt-4 inline-block rounded-lg border border-[#222222] bg-[#222222] px-4 py-2 text-[13px] font-medium text-white transition hover:bg-[#000000]"
          >
            Search stays
          </Link>
        </div>
      ) : (
        <ul className="grid w-full gap-4">
          {rows.map((s) => {
            const { destination, subtext } = getSavedSearchDisplay(
              s.query,
              s.name,
            );
            const href = savedSearchResultsHref(s.query);
            return (
              <li key={s.id} className="w-full">
                <div className="group relative w-full">
                  <button
                    type="button"
                    className={cn(
                      "relative w-full rounded-xl border border-[#e2e8e4] bg-white p-4 pr-12 text-left shadow-sm transition duration-150",
                      "hover:border-[#c5d4cc] hover:shadow-md sm:flex-row sm:items-center",
                    )}
                    onClick={() => router.push(href)}
                  >
                    <div className="flex gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F7F7F7]">
                        <MapPin
                          className="h-[18px] w-[18px] text-[#222222]"
                          strokeWidth={1.75}
                          aria-hidden
                        />
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className="truncate text-[14px] font-semibold text-[#222222]">
                          {destination}
                        </p>
                        <p className="mt-0.5 truncate text-[13px] text-[#717171]">
                          {subtext}
                        </p>
                        {s.alerts_enabled ? (
                          <p className="mt-1 text-[11px] font-medium text-[#717171]">
                            Alerts on
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full text-[#717171] transition hover:bg-[#F7F7F7] hover:text-[#222222]"
                    aria-label={`Remove saved search for ${destination}`}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(s.id)}
                  >
                    <X className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
