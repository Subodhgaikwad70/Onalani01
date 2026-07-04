import {
  ADMIN_ROLES,
  jsonError,
  type SessionContext,
  type UserRole,
} from "./session";

/**
 * Wraps a route handler so that it only runs for users matching `roles`.
 * Receives the validated `SessionContext` as the third argument.
 */
import { getSessionContext } from "./session";

export type AuthorizedRouteHandler<TParams = unknown> = (
  req: Request,
  ctx: { params: Promise<TParams> },
  session: SessionContext,
) => Promise<Response> | Response;

export function requireRole<TParams = unknown>(
  roles: UserRole[],
  handler: AuthorizedRouteHandler<TParams>,
) {
  return async (req: Request, ctx: { params: Promise<TParams> }) => {
    const session = await getSessionContext();
    if (!session) {
      return jsonError(401, "Authentication required");
    }
    if (!roles.includes(session.role)) {
      return jsonError(403, `Forbidden for role '${session.role}'`);
    }
    return handler(req, ctx, session);
  };
}

/** Staff routes: admin and super_admin (functionally equivalent). */
export function requireAdmin<TParams = unknown>(
  handler: AuthorizedRouteHandler<TParams>,
) {
  return requireRole<TParams>(ADMIN_ROLES, handler);
}

export function requireAuth<TParams = unknown>(
  handler: AuthorizedRouteHandler<TParams>,
) {
  return requireRole<TParams>(["guest", ...ADMIN_ROLES], handler);
}
