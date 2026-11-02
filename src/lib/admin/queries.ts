import "server-only";
import { and, count, desc, eq, gte, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  adminTaskRows,
  adminOperations,
  creditPackages,
  creditTransactions,
  db,
  users,
  videos,
  VideoStatus,
  CreditTransType,
} from "@/db";

export type Params = Record<string, string | string[] | undefined>;
export const PAGE_SIZE = 15;
export const taskLabels: Record<string, string> = {
  QUEUED: "排队中",
  RUNNING: "执行中",
  SUCCEEDED: "已成功",
  PENDING: "待提交",
  GENERATING: "生成中",
  UPLOADING: "转存中",
  COMPLETED: "已完成",
  FAILED: "失败",
};
export const ledgerLabels: Record<string, string> = {
  REFUND_HOLD:"现金退款预留",REFUND_RECLAIM:"现金退款积分回收",REFUND_RELEASE:"退款失败释放预留",
  TASK_HOLD: "任务冻结",
  TASK_SETTLE: "任务结算（已冻结）",
  TASK_RELEASE: "任务失败释放",
  NEW_USER: "注册赠送",
  ORDER_PAY: "购买充值",
  SUBSCRIPTION: "订阅到账",
  VIDEO_CONSUME: "生成消费",
  REFUND: "失败释放 / 历史退款",
  EXPIRED: "积分过期",
  SYSTEM_ADJUST: "人工调整 / 初始化",
};
export const actionLabels: Record<string, string> = {
  CREDIT_GRANT: "手动发积分",
  USER_DISABLE: "停用账号",
  USER_ENABLE: "恢复账号",
};
export const param = (params: Params, name: string) =>
  typeof params[name] === "string" ? (params[name] as string).trim().slice(0, 200) : "";
const pattern = (value: string) => `%${value.replace(/[\\%_]/g, "\\$&")}%`;
function pageInfo(params: Params, total: number) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(param(params, "page"))) || 1));
  return { page, pages, total, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE };
}
function dateValue(value: string, end = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00+08:00`);
  if (
    !Number.isFinite(date.getTime()) ||
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date) !== value
  )
    return null;
  return new Date(date.getTime() + (end ? 86400000 : 0));
}
const summaryColumns = () => ({
  available:
    sql<number>`(select coalesce(sum(p.remaining_credits),0) from credit_packages p where p.user_id="user"."id" and p.status='ACTIVE' and (p.expired_at is null or p.expired_at > ${new Date().toISOString()}::timestamp))`.mapWith(
      Number,
    ),
  frozen:
    sql<number>`(select coalesce(sum(p.frozen_credits),0) from credit_packages p where p.user_id="user"."id")`.mapWith(
      Number,
    ),
  taskCount:
    sql<number>`((select count(*) from videos v where v.user_id="user"."id") + (select count(*) from tasks t where t.user_id="user"."id"))`.mapWith(
      Number,
    ),
});
export async function listAdminUsers(params: Params) {
  const filters: SQL[] = [];
  const q = param(params, "q");
  const role = param(params, "role");
  const status = param(params, "status");
  if (q)
    filters.push(
      or(ilike(users.email, pattern(q)), ilike(users.name, pattern(q)), eq(users.id, q))!,
    );
  if (role === "admin" || role === "user") filters.push(eq(users.isAdmin, role === "admin"));
  if (status === "active" || status === "disabled")
    filters.push(eq(users.disabled, status === "disabled"));
  const where = and(...filters);
  const [total] = await db.select({ value: count() }).from(users).where(where);
  const pagination = pageInfo(params, total.value);
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      isAdmin: users.isAdmin,
      disabled: users.disabled,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
      ...summaryColumns(),
    })
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt), desc(users.id))
    .limit(PAGE_SIZE)
    .offset(pagination.offset);
  return { rows, ...pagination };
}
export async function getAdminUser(id: string) {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      isAdmin: users.isAdmin,
      disabled: users.disabled,
      disabledReason: users.disabledReason,
      disabledAt: users.disabledAt,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
      ...summaryColumns(),
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return user;
}
export async function listAdminTasks(params: Params) {
  const filters: SQL[] = [];
  const q = param(params, "q");
  const userId = param(params, "userId");
  const status = param(params, "status");
  const model = param(params, "model");
  const provider = param(params, "provider");
  const deleted = param(params, "deleted");
  if (q)
    filters.push(
      or(
        ilike(adminTaskRows.uuid, pattern(q)),
        ilike(adminTaskRows.prompt, pattern(q)),
        ilike(users.email, pattern(q)),
        ilike(adminTaskRows.externalTaskId, pattern(q)),
      )!,
    );
  if (userId) filters.push(eq(adminTaskRows.userId, userId));
  if (Object.hasOwn(taskLabels, status)) filters.push(eq(adminTaskRows.status, status));
  if (model) filters.push(ilike(adminTaskRows.model, pattern(model)));
  if (provider) filters.push(eq(adminTaskRows.provider, provider));
  if (deleted === "yes" || deleted === "no")
    filters.push(eq(adminTaskRows.isDeleted, deleted === "yes"));
  const where = and(...filters);
  const [total] = await db
    .select({ value: count() })
    .from(adminTaskRows)
    .leftJoin(users, eq(users.id, adminTaskRows.userId))
    .where(where);
  const pagination = pageInfo(params, total.value);
  const rows = await db
    .select({
      uuid: adminTaskRows.uuid,
      kind: adminTaskRows.kind,
      userId: adminTaskRows.userId,
      email: users.email,
      model: adminTaskRows.model,
      provider: adminTaskRows.provider,
      status: adminTaskRows.status,
      prompt: adminTaskRows.prompt,
      creditsUsed: adminTaskRows.creditsUsed,
      createdAt: adminTaskRows.createdAt,
      errorMessage: adminTaskRows.errorMessage,
      isDeleted: adminTaskRows.isDeleted,
    })
    .from(adminTaskRows)
    .leftJoin(users, eq(users.id, adminTaskRows.userId))
    .where(where)
    .orderBy(desc(adminTaskRows.createdAt), desc(adminTaskRows.uuid))
    .limit(PAGE_SIZE)
    .offset(pagination.offset);
  return { rows, ...pagination };
}
export async function getAdminTask(uuid: string) {
  const [row] = await db
    .select({ task: videos, email: users.email, name: users.name })
    .from(videos)
    .leftJoin(users, eq(users.id, videos.userId))
    .where(eq(videos.uuid, uuid))
    .limit(1);
  return row;
}
export async function listAdminLedger(params: Params) {
  const actor = alias(users, "actor");
  const filters: SQL[] = [];
  const q = param(params, "q");
  const userId = param(params, "userId");
  const type = param(params, "type");
  if (q)
    filters.push(
      or(
        ilike(creditTransactions.transNo, pattern(q)),
        ilike(creditTransactions.orderNo, pattern(q)),
        ilike(creditTransactions.videoUuid, pattern(q)),
        ilike(creditTransactions.taskId, pattern(q)),
        ilike(users.email, pattern(q)),
        ilike(creditTransactions.remark, pattern(q)),
        ilike(adminOperations.requestId, pattern(q)),
      )!,
    );
  if (userId) filters.push(eq(creditTransactions.userId, userId));
  if (Object.values(CreditTransType).includes(type as CreditTransType))
    filters.push(eq(creditTransactions.transType, type as CreditTransType));
  const from = dateValue(param(params, "from"));
  const to = dateValue(param(params, "to"), true);
  if (from) filters.push(gte(creditTransactions.createdAt, from));
  if (to) filters.push(lt(creditTransactions.createdAt, to));
  const where = and(...filters);
  const [total] = await db
    .select({ value: count() })
    .from(creditTransactions)
    .leftJoin(users, eq(users.id, creditTransactions.userId))
    .leftJoin(adminOperations, eq(adminOperations.transactionId, creditTransactions.id))
    .where(where);
  const pagination = pageInfo(params, total.value);
  const rows = await db
    .select({
      id: creditTransactions.id,
      transNo: creditTransactions.transNo,
      userId: creditTransactions.userId,
      email: users.email,
      transType: creditTransactions.transType,
      credits: creditTransactions.credits,
      balanceAfter: creditTransactions.balanceAfter,
      remark: creditTransactions.remark,
      orderNo: creditTransactions.orderNo,
      videoUuid: creditTransactions.videoUuid,
      taskId: creditTransactions.taskId,
      packageId: creditTransactions.packageId,
      holdId: creditTransactions.holdId,
      createdAt: creditTransactions.createdAt,
      actorEmail: actor.email,
      requestId: adminOperations.requestId,
      operationId: adminOperations.id,
      expiresAt: creditPackages.expiredAt,
    })
    .from(creditTransactions)
    .leftJoin(users, eq(users.id, creditTransactions.userId))
    .leftJoin(actor, eq(actor.id, creditTransactions.actorUserId))
    .leftJoin(adminOperations, eq(adminOperations.transactionId, creditTransactions.id))
    .leftJoin(creditPackages, eq(creditPackages.id, creditTransactions.packageId))
    .where(where)
    .orderBy(desc(creditTransactions.createdAt), desc(creditTransactions.id))
    .limit(PAGE_SIZE)
    .offset(pagination.offset);
  return { rows, ...pagination };
}
export async function userAudit(userId: string) {
  const actor = alias(users, "operator");
  return db
    .select({
      id: adminOperations.id,
      action: adminOperations.action,
      reason: adminOperations.reason,
      credits: adminOperations.credits,
      requestId: adminOperations.requestId,
      actorEmail: actor.email,
      createdAt: adminOperations.createdAt,
    })
    .from(adminOperations)
    .leftJoin(actor, eq(actor.id, adminOperations.actorUserId))
    .where(eq(adminOperations.targetUserId, userId))
    .orderBy(desc(adminOperations.createdAt), desc(adminOperations.id))
    .limit(10);
}
