import { createSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Append a row to admin_audit_log. Should be called from any /api/admin/*
 * route that mutates state (refunds, role changes, suspensions, etc.).
 *
 * Snapshot before/after states are stored as JSONB so admins can diff history.
 */
export async function recordAdminAction(input: {
  adminId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string;
}): Promise<void> {
  const admin = createSupabaseAdmin();
  await admin.from("admin_audit_log").insert({
    admin_id: input.adminId,
    action: input.action,
    target_type: input.targetType ?? null,
    target_id: input.targetId ?? null,
    before_state: input.before ?? null,
    after_state: input.after ?? null,
    ip_address: input.ipAddress ?? null,
  });
}
