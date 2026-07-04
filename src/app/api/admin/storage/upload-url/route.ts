import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { z } from "zod";
import { parseJsonBody } from "@/lib/auth/schemas";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const uploadBodySchema = z.object({
  bucket: z.enum(["listing-photos", "property-photos"]),
  filename: z.string().min(1).max(200),
  content_type: z.string().min(1).max(120),
});

/**
 * POST /api/admin/storage/upload-url
 *
 * Returns a signed upload URL for a Supabase Storage object that staff
 * can PUT to directly. Paths are namespaced under the caller's profile id.
 *
 * Buckets `property-photos` and `listing-photos` must exist (public read).
 * Run `npm run storage:setup` or apply migration 20260528100000_create_storage_buckets.sql.
 */
export const POST = requireAdmin(async (req, _ctx, session) => {
    const { data, error } = await parseJsonBody(req, uploadBodySchema);
    if (error) return error;

    const safeFilename = data.filename
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 160);
    const path = `${session.user.id}/${Date.now()}_${safeFilename}`;

    let admin;
    try {
      admin = createSupabaseAdmin();
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Supabase admin client unavailable";
      return jsonError(503, message);
    }

    const { data: signed, error: signError } = await admin.storage
      .from(data.bucket)
      .createSignedUploadUrl(path, { upsert: false });

    if (signError) {
      const hint =
        signError.message.toLowerCase().includes("bucket") ||
        signError.message.toLowerCase().includes("not found")
          ? ` Create the "${data.bucket}" bucket (npm run storage:setup).`
          : "";
      return jsonError(500, `${signError.message}${hint}`);
    }

    const { data: publicData } = admin.storage
      .from(data.bucket)
      .getPublicUrl(path);

    return Response.json({
      bucket: data.bucket,
      path,
      token: signed.token,
      signed_url: signed.signedUrl,
      public_url: publicData.publicUrl,
    });
  },
);
