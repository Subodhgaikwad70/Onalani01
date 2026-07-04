"use client";

import { useEffect, useState } from "react";
import { WishlistSaveSheet } from "@/components/wishlist/wishlist-save-sheet";

export function ListingPhotoGallery({
  photos,
  title,
  listingId,
  listingSlug,
}: {
  photos: string[];
  title: string;
  listingId?: string;
  listingSlug?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const visiblePhotos = photos.length > 0 ? photos : [];
  const gridPhotos =
    visiblePhotos.length > 1
      ? visiblePhotos.slice(1, 5)
      : [visiblePhotos[0], visiblePhotos[0], visiblePhotos[0], visiblePhotos[0]];

  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  if (visiblePhotos.length === 0) {
    return null;
  }

  return (
    <>
      <section className="mt-6 overflow-hidden rounded-3xl">
        <div className="relative grid h-[320px] gap-2 md:h-[460px] md:grid-cols-4 md:grid-rows-2">
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="min-h-[320px] bg-cover bg-center text-left transition hover:brightness-90 md:col-span-2 md:row-span-2 md:min-h-0"
            style={{ backgroundImage: `url(${visiblePhotos[0]})` }}
            aria-label={`Open photos for ${title}`}
          />
          {gridPhotos.map((photo, index) => (
            <button
              key={`${photo}-${index}`}
              type="button"
              onClick={() => setIsOpen(true)}
              className="hidden bg-cover bg-center transition hover:brightness-90 md:block"
              style={{ backgroundImage: `url(${photo})` }}
              aria-label={`Open photo ${index + 2} for ${title}`}
            />
          ))}
          {listingId && listingSlug ? (
            <div className="absolute right-4 top-4 z-10">
              <WishlistSaveSheet
                listingId={listingId}
                listingSlug={listingSlug}
                variant="icon"
              />
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="absolute bottom-4 right-4 rounded-lg border border-[#222222] bg-white px-4 py-2 text-sm font-semibold text-[#222222] shadow-sm transition hover:bg-white"
          >
            Show all photos
          </button>
        </div>
      </section>

      {isOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${title} photos`}
          className="fixed inset-0 z-50 overflow-y-auto bg-white text-[#222222]"
        >
          <div className="sticky top-0 z-10 border-b border-[#dddddd] bg-white/95 px-5 py-4 backdrop-blur md:px-8">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-full px-4 py-2 text-sm font-semibold transition hover:bg-white"
              >
                x Close
              </button>
              <p className="text-sm font-semibold">
                {visiblePhotos.length} photo{visiblePhotos.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          <div className="mx-auto max-w-5xl px-5 py-8 md:px-8">
            <h2 className="font-[family-name:var(--font-lora)] text-2xl font-semibold md:text-3xl">
              {title}
            </h2>
            <div className="mt-8 grid gap-4">
              {visiblePhotos.map((photo, index) => (
                <div
                  key={`${photo}-${index}`}
                  className="overflow-hidden rounded-2xl bg-white"
                >
                  <img
                    src={photo}
                    alt={`${title} photo ${index + 1}`}
                    className="h-auto w-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
