"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addMonths, format, startOfMonth } from "date-fns";
import { CalendarRange, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { WishlistSaveSheet } from "@/components/wishlist/wishlist-save-sheet";
import { ApiError, apiPost } from "@/lib/api/client";
import { formatMoney } from "@/lib/format";
import { useSupabaseSession } from "@/lib/supabase/session-context";

type ReviewRow = {
  id: string;
  overall_rating: number | null;
  public_body: string | null;
  published_at: string | null;
  profiles?: { display_name: string | null; avatar_url: string | null };
};

type ReviewsPayload = {
  rating_avg: number | null;
  rating_count: number | null;
  reviews: ReviewRow[];
};

export function ListingInteractive({
  slug,
  listingId,
  headline,
  locationLine,
  heroImage,
  unitDescription,
  unitOccupancy,
  bathLabel,
  areaLabel,
  kitchen,
  amenities,
  isActive,
  propertySlug,
  instantBook,
  basePriceCents,
  currency,
}: {
  slug: string;
  listingId: string;
  headline: string;
  locationLine: string | null;
  heroImage: string;
  unitDescription: string | null;
  unitOccupancy: number | null;
  bathLabel: string | null;
  areaLabel: string | null;
  kitchen: string | null;
  amenities: string[];
  isActive: boolean;
  propertySlug: string | null;
  instantBook: boolean;
  basePriceCents: number;
  currency: string;
}) {
  const { user } = useSupabaseSession();
  const [month, setMonth] = useState(() => new Date());
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(String(unitOccupancy ?? 2));
  const [contactOpen, setContactOpen] = useState(false);
  const [contactBody, setContactBody] = useState("");
  useEffect(() => {
    void fetch(`/api/listings/${encodeURIComponent(slug)}/view`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
  }, [slug]);

  const range = useMemo(() => {
    const from = format(startOfMonth(month), "yyyy-MM-dd");
    const to = format(startOfMonth(addMonths(month, 1)), "yyyy-MM-dd");
    return { from, to };
  }, [month]);

  const { data: availability } = useQuery({
    queryKey: ["availability", slug, range.from, range.to],
    queryFn: async () => {
      const u = `/api/availability?listing_slug=${encodeURIComponent(slug)}&from=${range.from}&to=${range.to}`;
      const r = await fetch(u);
      if (!r.ok) throw new Error("availability");
      return r.json() as Promise<{
        available: Record<string, boolean>;
        prices_cents: Record<string, number>;
      }>;
    },
  });

  const { data: reviews } = useQuery({
    queryKey: ["reviews", slug],
    queryFn: async () => {
      const r = await fetch(`/api/listings/${encodeURIComponent(slug)}/reviews`);
      if (!r.ok) throw new Error("reviews");
      return r.json() as Promise<ReviewsPayload>;
    },
  });

  const bookHref = useMemo(() => {
    const p = new URLSearchParams();
    if (checkIn) p.set("check_in", checkIn);
    if (checkOut) p.set("check_out", checkOut);
    const g = Number(guests);
    if (Number.isFinite(g) && g > 0) p.set("adults", String(g));
    const q = p.toString();
    return `/listings/${slug}/book${q ? `?${q}` : ""}`;
  }, [checkIn, checkOut, guests, slug]);

  async function sendContact() {
    if (!contactBody.trim()) {
      toast.error("Write a short message");
      return;
    }
    try {
      await apiPost("/api/conversations", {
        listing_id: listingId,
        initial_message: contactBody.trim(),
      });
      toast.success("Message sent");
      setContactBody("");
      setContactOpen(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not send");
    }
  }

  const unavailableMatcher = (date: Date) => {
    const key = format(date, "yyyy-MM-dd");
    const a = availability?.available;
    if (!a) return false;
    return a[key] === false;
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-5 py-10 md:grid-cols-[1fr_340px] md:px-6">
      <div className="space-y-10">
        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              className="relative block w-full overflow-hidden rounded-2xl border border-border bg-muted text-left shadow-sm"
            >
              <div
                className="aspect-[16/10] bg-cover bg-center"
                style={{ backgroundImage: `url(${heroImage})` }}
              />
              <span className="sr-only">Open photo</span>
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl border-0 bg-transparent p-0 shadow-none">
            <div
              className="aspect-video max-h-[80vh] rounded-xl bg-cover bg-center"
              style={{ backgroundImage: `url(${heroImage})` }}
            />
          </DialogContent>
        </Dialog>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            {!isActive ? (
              <Badge variant="destructive">Unavailable</Badge>
            ) : null}
            {instantBook ? <Badge>Instant book</Badge> : null}
          </div>
          <h1 className="mt-3 font-[family-name:var(--font-lora)] text-3xl font-semibold md:text-4xl">
            {headline}
          </h1>
          {locationLine ? (
            <p className="mt-2 text-muted-foreground">{locationLine}</p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {unitOccupancy != null ? (
              <Badge variant="secondary">Sleeps {unitOccupancy}</Badge>
            ) : null}
            {bathLabel ? (
              <Badge variant="secondary">{bathLabel} baths</Badge>
            ) : null}
            {areaLabel ? (
              <Badge variant="secondary">Area {areaLabel}</Badge>
            ) : null}
            {kitchen ? (
              <Badge variant="secondary">Kitchen · {kitchen}</Badge>
            ) : null}
            {propertySlug ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/properties/${propertySlug}`}>View property</Link>
              </Button>
            ) : null}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Availability</CardTitle>
            <CardDescription>
              Grayed-out nights are not available for these dates.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-start gap-4">
            <Calendar
              mode="single"
              month={month}
              onMonthChange={setMonth}
              disabled={unavailableMatcher}
              modifiersClassNames={{
                disabled: "opacity-40 line-through",
              }}
            />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarRange className="h-4 w-4" />
              Prices from {formatMoney(basePriceCents, currency)} / night before fees & taxes.
            </div>
          </CardContent>
        </Card>

        {reviews && (reviews.rating_count ?? 0) > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Guest reviews</CardTitle>
              <CardDescription>
                ★ {Number(reviews.rating_avg ?? 0).toFixed(1)} ·{" "}
                {reviews.rating_count} review
                {(reviews.rating_count ?? 0) === 1 ? "" : "s"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {reviews.reviews.slice(0, 8).map((r) => (
                <div key={r.id} className="border-b border-border pb-4 last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {r.profiles?.display_name ?? "Guest"}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {r.overall_rating != null ? `★ ${r.overall_rating}` : ""}
                    </span>
                  </div>
                  {r.public_body ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {r.public_body}
                    </p>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {unitDescription ? (
          <Card>
            <CardHeader>
              <CardTitle>About this unit</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                {unitDescription}
              </p>
            </CardContent>
          </Card>
        ) : null}

        {amenities.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Amenities</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {amenities.map((a) => (
                <div
                  key={a}
                  className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm"
                >
                  {a}
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="md:sticky md:top-24 h-fit space-y-4">
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="text-2xl">
              {formatMoney(basePriceCents, currency)}
              <span className="text-base font-normal text-muted-foreground">
                {" "}
                / night
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              <div className="space-y-1.5">
                <Label>Check-in</Label>
                <Input
                  type="date"
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Check-out</Label>
                <Input
                  type="date"
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Guests</Label>
                <Input
                  type="number"
                  min={1}
                  value={guests}
                  onChange={(e) => setGuests(e.target.value)}
                />
              </div>
            </div>
            <Button className="w-full" asChild disabled={!isActive}>
              <Link href={bookHref}>Book this stay</Link>
            </Button>
            <div className="flex gap-2">
              <WishlistSaveSheet
                listingId={listingId}
                listingSlug={slug}
                variant="button"
              />

              <Sheet open={contactOpen} onOpenChange={setContactOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" className="flex-1 gap-2">
                    <MessageCircle className="h-4 w-4" />
                    Contact host
                  </Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>Message the host</SheetTitle>
                  </SheetHeader>
                  {!user?.email ? (
                    <p className="mt-4 text-sm text-muted-foreground">
                      <Link
                        href={`/auth/login?next=/listings/${slug}`}
                        className="text-primary underline"
                      >
                        Log in
                      </Link>{" "}
                      to send a message.
                    </p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      <Textarea
                        placeholder="Ask about check-in, amenities, or availability…"
                        value={contactBody}
                        onChange={(e) => setContactBody(e.target.value)}
                        rows={6}
                      />
                      <Button type="button" className="w-full" onClick={sendContact}>
                        Send message
                      </Button>
                    </div>
                  )}
                </SheetContent>
              </Sheet>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
