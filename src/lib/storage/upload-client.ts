export type StorageUploadBucket = "property-photos" | "listing-photos";

export type UploadedStorageObject = {
  url: string;
  path: string;
  bucket: StorageUploadBucket;
};

/**
 * Upload a file to Supabase Storage via a signed URL from the admin API.
 * Returns the public URL to store in `photos_url` (or similar) columns.
 */
export async function uploadToSupabaseStorage(
  file: File,
  bucket: StorageUploadBucket,
): Promise<UploadedStorageObject> {
  const contentType =
    file.type || guessImageContentType(file.name) || "application/octet-stream";

  const res = await fetch("/api/admin/storage/upload-url", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket,
      filename: file.name,
      content_type: contentType,
    }),
  });

  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(
      (j as { error?: { message?: string } }).error?.message ??
        "Failed to get upload URL",
    );
  }

  const body = (await res.json()) as {
    signed_url: string;
    path: string;
    bucket: StorageUploadBucket;
    public_url: string;
  };

  const put = await fetch(body.signed_url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
  });
  if (!put.ok) {
    throw new Error("Upload to storage failed");
  }

  return {
    url: body.public_url,
    path: body.path,
    bucket: body.bucket,
  };
}

function guessImageContentType(filename: string): string | null {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "heic":
      return "image/heic";
    case "heif":
      return "image/heif";
    default:
      return null;
  }
}
