import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/guests?page=1&limit=25&q=
 * Paginated guest profiles for admin selection (credit grants, etc.).
 */
export const GET = requireAdmin(async (req) => {
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const limit = Math.min(
    50,
    Math.max(1, Number(url.searchParams.get("limit") ?? "25")),
  );
  const q = url.searchParams.get("q")?.trim() ?? "";
  const includeArchived = url.searchParams.get("include_archived") === "1";
  const offset = (page - 1) * limit;

  const admin = createSupabaseAdmin();
  let query = admin
    .from("profiles")
    .select("id, display_name, role, phone, created_at, archived_at", {
      count: "exact",
    })
    .eq("role", "guest")
    .order("display_name", { ascending: true });

  if (!includeArchived) {
    query = query.is("archived_at", null);
  }

  if (q) {
    if (UUID_RE.test(q)) {
      query = query.eq("id", q);
    } else {
      const escaped = q.replace(/[%_]/g, "\\$&");
      query = query.or(
        `display_name.ilike.%${escaped}%,phone.ilike.%${escaped}%`,
      );
    }
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if (error) return jsonError(500, error.message);

  return Response.json({
    guests: data ?? [],
    page,
    limit,
    total: count ?? 0,
    total_pages: count != null ? Math.max(1, Math.ceil(count / limit)) : 1,
  });
});
