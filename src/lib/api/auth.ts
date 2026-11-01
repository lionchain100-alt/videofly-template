import { auth, type User } from "@/lib/auth";
import { getActiveSessionUser } from "@/lib/auth/active-user";

import { ApiError } from "./error";

/**
 * Get authenticated user from request headers
 * Returns null if not authenticated
 */
export async function getAuthUser(request: Request): Promise<User | null> {
  return getActiveSessionUser(request.headers);
}

/**
 * Require authentication - throws ApiError if not authenticated
 */
export async function requireAuth(request: Request): Promise<User> {
  const user = await getAuthUser(request);
  if (!user) {
    throw new ApiError("Unauthorized", 401);
  }
  return user;
}

export async function requireAdminMutation(request: Request): Promise<User> {
  const admin = await requireAdmin(request);
  requireTrustedMutation(request);
  return admin;
}

export async function requireUserMutation(request: Request): Promise<User> {
  const user = await requireAuth(request);
  requireTrustedMutation(request);
  return user;
}

function requireTrustedMutation(request: Request) {
  const expectedOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL || request.url).origin;
  if (
    request.headers.get("origin") !== expectedOrigin ||
    ["cross-site", "same-site"].includes(request.headers.get("sec-fetch-site") || "")
  )
    throw new ApiError("请求来源不受信任", 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    throw new ApiError("请使用 JSON 提交", 415);
}

/**
 * Require admin role - throws ApiError if not admin
 */
export async function requireAdmin(request: Request): Promise<User> {
  const user = await requireAuth(request);
  if (!user.isAdmin || !user.emailVerified) {
    throw new ApiError("Forbidden", 403);
  }
  return user;
}
