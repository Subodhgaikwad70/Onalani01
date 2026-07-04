import { requireAdmin } from "@/lib/auth/guards";
import { jsonError } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/users?page=1&limit=25&role=guest&status=active&q=
 * Paginated profile list for the admin users console.
 */
export const GET = requireAdmin(async (req) => {
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const limit = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("limit") ?? "25")),
  );
  const offset = (page - 1) * limit;
  const role = url.searchParams.get("role")?.trim() ?? "";
  const status = url.searchParams.get("status")?.trim() ?? "";
  const q = url.searchParams.get("q")?.trim() ?? "";

  const admin = createSupabaseAdmin();
  let query = admin
    .from("profiles")
    .select(
      "id, display_name, role, avatar_url, archived_at, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

  if (role === "guest" || role === "admin" || role === "super_admin") {
    query = query.eq("role", role);
  } else if (role === "staff") {
    query = query.in("role", ["admin", "super_admin"]);
  }

  if (status === "active") {
    query = query.is("archived_at", null);
  } else if (status === "suspended") {
    query = query.not("archived_at", "is", null);
  }

  if (q.length >= 2) {
    if (UUID_RE.test(q)) {
      query = query.eq("id", q);
    } else {
      query = query.ilike("display_name", `%${q}%`);
    }
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if (error) return jsonError(500, error.message);

  return Response.json({
    users: data ?? [],
    page,
    limit,
    total: count ?? 0,
  });
});
