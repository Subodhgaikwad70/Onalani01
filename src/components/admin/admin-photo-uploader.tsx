"use client";

import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  uploadToSupabaseStorage,
  type StorageUploadBucket,
} from "@/lib/storage/upload-client";

export type AdminUploadedPhoto = {
  url: string;
  path: string;
  name: string;
};

type AdminPhotoUploaderProps = {
  bucket: StorageUploadBucket;
  photos: AdminUploadedPhoto[];
  onPhotosChange: Dispatch<SetStateAction<AdminUploadedPhoto[]>>;
  onUploadingChange?: (uploading: boolean) => void;
  uploading?: boolean;
  disabled?: boolean;
};

export function AdminPhotoUploader({
  bucket,
  photos,
  onPhotosChange,
  onUploadingChange,
  uploading = false,
  disabled = false,
}: AdminPhotoUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const setUploading = useCallback(
    (value: boolean) => {
      onUploadingChange?.(value);
    },
    [onUploadingChange],
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      setUploading(true);

      const newPhotos: AdminUploadedPhoto[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/") && !guessIsImage(file.name)) {
          toast.error(`${file.name} is not an image`);
          continue;
        }
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name} exceeds 10 MB limit`);
          continue;
        }
        try {
          const result = await uploadToSupabaseStorage(file, bucket);
          newPhotos.push({ ...result, name: file.name });
        } catch (err) {
          toast.error(
            `Failed to upload ${file.name}: ${err instanceof Error ? err.message : "Unknown error"}`,
          );
        }
      }

      if (newPhotos.length > 0) {
        onPhotosChange((prev) => [...prev, ...newPhotos]);
        toast.success(
          `${newPhotos.length} photo${newPhotos.length === 1 ? "" : "s"} uploaded`,
        );
      }
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [bucket, onPhotosChange, setUploading],
  );

  const removePhoto = useCallback(
    (index: number) => {
      onPhotosChange((prev) => prev.filter((_, i) => i !== index));
    },
    [onPhotosChange],
  );

  return (
    <div className="space-y-5">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileSelect}
        disabled={disabled || uploading}
      />

      {photos.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {photos.map((photo, i) => (
            <div
              key={photo.path}
              className="group relative overflow-hidden rounded-xl border border-[#dfe6e1]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={photo.name}
                className="aspect-[4/3] w-full object-cover"
              />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                disabled={disabled || uploading}
                className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white opacity-0 transition hover:bg-black/80 group-hover:opacity-100 disabled:cursor-not-allowed"
                aria-label={`Remove ${photo.name}`}
              >
                <X className="h-4 w-4" />
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent px-3 pb-2 pt-6">
                <p className="truncate text-xs text-white">{photo.name}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        disabled={disabled || uploading}
        onClick={() => fileInputRef.current?.click()}
        className="flex w-full cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[#cfd8d3] bg-[#fafcfb] px-6 py-10 text-sm text-[#5f6b66] transition hover:border-[#5cbadf] hover:bg-[#f0f9fc] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {uploading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Uploading...
          </>
        ) : (
          <>
            <ImagePlus className="h-5 w-5" />
            Click to upload photos
          </>
        )}
      </button>
    </div>
  );
}

function guessIsImage(filename: string): boolean {
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(filename);
}
