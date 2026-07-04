"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/lib/format";
import {
  adminReviewBooking,
  adminReviewHasHostResponse,
  adminReviewListingTitle,
  type AdminReviewListRow,
} from "@/lib/reviews/admin-types";

type PublishedFilter = "all" | "published" | "unpublished";

function publishedParam(filter: PublishedFilter): string | undefined {
  if (filter === "published") return "true";
  if (filter === "unpublished") return "false";
  return undefined;
}

export function AdminReviewsClient() {
  const [filter, setFilter] = useState<PublishedFilter>("all");
  const [search, setSearch] = useState("");

  const { data, isPending } = useQuery({
    queryKey: ["admin-reviews", filter],
    queryFn: async () => {
      const params = new URLSearchParams({ subject_type: "listing" });
      const published = publishedParam(filter);
      if (published) params.set("published", published);
      const res = await fetch(`/api/admin/reviews?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("reviews");
      return res.json() as Promise<{ reviews: AdminReviewListRow[] }>;
    },
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = data?.reviews ?? [];
    if (!q) return list;
    return list.filter((row) => {
      const author = row.author?.display_name ?? "";
      const body = row.public_body ?? "";
      const booking = adminReviewBooking(row);
      const haystack = [
        author,
        body,
        adminReviewListingTitle(row),
        booking?.code ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [data?.reviews, search]);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="font-[family-name:var(--font-lora)] text-2xl font-semibold">
          Guest reviews
        </h1>
        <p className="text-sm text-muted-foreground">
          Read and manage listing reviews submitted by past guests.
        </p>
      </header>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={filter}
          onValueChange={(value) => setFilter(value as PublishedFilter)}
        >
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="published">Published</TabsTrigger>
            <TabsTrigger value="unpublished">Unpublished</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search guest, listing, or text…"
            className="pl-9"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Guest</TableHead>
              <TableHead>Listing</TableHead>
              <TableHead>Rating</TableHead>
              <TableHead>Visibility</TableHead>
              <TableHead>Host response</TableHead>
              <TableHead>Stay</TableHead>
              <TableHead>Review</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  Loading reviews…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No reviews match your filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const booking = adminReviewBooking(row);
                const preview = row.public_body?.trim();
                const hostResponded = adminReviewHasHostResponse(row.review_responses);
                return (
                  <TableRow key={row.id} className="cursor-pointer hover:bg-muted/40">
                    <TableCell className="font-medium">
                      <Link href={`/admin/reviews/${row.id}`} className="block">
                        {row.author?.display_name?.trim() || "Guest"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/reviews/${row.id}`} className="block">
                        {adminReviewListingTitle(row)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/reviews/${row.id}`} className="block">
                        ★ {row.overall_rating}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/reviews/${row.id}`} className="block">
                        <Badge variant={row.is_published ? "default" : "secondary"}>
                          {row.is_published ? "Published" : "Unpublished"}
                        </Badge>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/reviews/${row.id}`} className="block">
                        <Badge variant={hostResponded ? "outline" : "secondary"}>
                          {hostResponded ? "Responded" : "Awaiting response"}
                        </Badge>
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      <Link href={`/admin/reviews/${row.id}`} className="block">
                        {booking
                          ? `${formatDate(booking.check_in)} → ${formatDate(booking.check_out)}`
                          : "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                      <Link href={`/admin/reviews/${row.id}`} className="block">
                        {preview || "No public comment"}
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
