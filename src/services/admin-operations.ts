import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { adminOperations, creditPackages, creditTransactions, db, sessions, users } from "@/db";
import { ApiError } from "@/lib/api/error";

export const grantSchema = z
  .object({
    requestId: z.string().uuid(),
    userId: z.string().min(1).max(128),
    credits: z.number().int().min(1).max(100000),
    expiryDays: z.number().int().min(1).max(3650),
    remark: z.string().trim().min(3).max(300),
  })
  .strict();
export const userStatusSchema = z
  .object({
    requestId: z.string().uuid(),
    userId: z.string().min(1).max(128),
    disabled: z.boolean(),
    reason: z.string().trim().min(3).max(300),
  })
  .strict();
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Operation = typeof adminOperations.$inferSelect;

async function lockAndAuthorize(tx: Tx, actorId: string, targetId: string) {
  const rows = await tx
    .select()
    .from(users)
    .where(inArray(users.id, [...new Set([actorId, targetId])]))
    .orderBy(asc(users.id))
    .for("update");
  const actor = rows.find((row) => row.id === actorId);
  const target = rows.find((row) => row.id === targetId);
  if (!actor || actor.disabled || !actor.isAdmin || !actor.emailVerified)
    throw new ApiError("需要有效的管理员权限", 403);
  if (!target) throw new ApiError("目标用户不存在", 404);
  return target;
}
function fingerprint(actorId: string, action: string, payload: unknown) {
  return createHash("sha256").update(JSON.stringify({ actorId, action, payload })).digest("hex");
}
function replay(existing: Operation, hash: string) {
  if (existing.requestHash !== hash)
    throw new ApiError("请求编号已用于另一项操作，请勿修改重试内容", 409, {
      code: "IDEMPOTENCY_CONFLICT",
    });
  return { ...existing, replayed: true };
}
async function existingOperation(tx: Tx, requestId: string, hash: string) {
  const [existing] = await tx
    .select()
    .from(adminOperations)
    .where(eq(adminOperations.requestId, requestId))
    .limit(1);
  return existing ? replay(existing, hash) : null;
}

export async function grantCredits(actorId: string, input: z.infer<typeof grantSchema>) {
  const action = "CREDIT_GRANT";
  const hash = fingerprint(actorId, action, input);
  return db.transaction(async (tx) => {
    const target = await lockAndAuthorize(tx, actorId, input.userId);
    const existing = await existingOperation(tx, input.requestId, hash);
    if (existing) return existing;
    if (target.disabled)
      throw new ApiError("用户已停用，请先恢复账号再发放积分", 409, { code: "USER_DISABLED" });
    const now = new Date();
    const expiresAt = new Date(now.getTime() + input.expiryDays * 86400000);
    const [operation] = await tx
      .insert(adminOperations)
      .values({
        requestId: input.requestId,
        requestHash: hash,
        actorUserId: actorId,
        targetUserId: input.userId,
        action,
        reason: input.remark,
        credits: input.credits,
        expiresAt,
      })
      .onConflictDoNothing({ target: adminOperations.requestId })
      .returning();
    if (!operation) {
      const duplicate = await existingOperation(tx, input.requestId, hash);
      if (duplicate) return duplicate;
      throw new ApiError("操作正在处理，请使用同一请求编号重试", 409);
    }
    const orderNo = `ADMIN_${input.requestId}`;
    const [pkg] = await tx
      .insert(creditPackages)
      .values({
        userId: input.userId,
        initialCredits: input.credits,
        remainingCredits: input.credits,
        frozenCredits: 0,
        transType: "SYSTEM_ADJUST",
        orderNo,
        status: "ACTIVE",
        expiredAt: expiresAt,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: creditPackages.id });
    const [balance] = await tx
      .select({
        value: sql<number>`coalesce(sum(${creditPackages.remainingCredits}),0)`.mapWith(Number),
      })
      .from(creditPackages)
      .where(
        and(
          eq(creditPackages.userId, input.userId),
          eq(creditPackages.status, "ACTIVE"),
          or(isNull(creditPackages.expiredAt), gt(creditPackages.expiredAt, now)),
        ),
      );
    const [entry] = await tx
      .insert(creditTransactions)
      .values({
        transNo: `TXN_${randomUUID()}`,
        userId: input.userId,
        actorUserId: actorId,
        transType: "SYSTEM_ADJUST",
        credits: input.credits,
        balanceAfter: balance.value,
        packageId: pkg.id,
        orderNo,
        remark: input.remark,
        createdAt: now,
      })
      .returning({ id: creditTransactions.id });
    const [completed] = await tx
      .update(adminOperations)
      .set({ packageId: pkg.id, transactionId: entry.id, balanceAfter: balance.value })
      .where(eq(adminOperations.id, operation.id))
      .returning();
    return { ...completed, replayed: false };
  });
}

export async function setUserDisabled(actorId: string, input: z.infer<typeof userStatusSchema>) {
  const action = input.disabled ? "USER_DISABLE" : "USER_ENABLE";
  const hash = fingerprint(actorId, action, input);
  return db.transaction(async (tx) => {
    const target = await lockAndAuthorize(tx, actorId, input.userId);
    const existing = await existingOperation(tx, input.requestId, hash);
    if (existing) return existing;
    if (target.isAdmin || target.id === actorId)
      throw new ApiError("不能通过此入口停用或修改管理员账号", 409, { code: "PROTECTED_ADMIN" });
    const [operation] = await tx
      .insert(adminOperations)
      .values({
        requestId: input.requestId,
        requestHash: hash,
        actorUserId: actorId,
        targetUserId: target.id,
        action,
        reason: input.reason,
      })
      .onConflictDoNothing({ target: adminOperations.requestId })
      .returning();
    if (!operation) {
      const duplicate = await existingOperation(tx, input.requestId, hash);
      if (duplicate) return duplicate;
      throw new ApiError("操作正在处理，请重试", 409);
    }
    await tx
      .update(users)
      .set({
        disabled: input.disabled,
        disabledReason: input.disabled ? input.reason : null,
        disabledAt: input.disabled ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, target.id));
    if (input.disabled) await tx.delete(sessions).where(eq(sessions.userId, target.id));
    return { ...operation, replayed: false };
  });
}
