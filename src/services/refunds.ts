import { createHash, randomUUID } from "node:crypto";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import {
  db,
  users,
  paymentOrders,
  paymentFulfillments,
  paymentRefunds,
  paymentRefundReviews,
  creditPackages,
  creditTransactions,
} from "@/db";
import { ApiError } from "@/lib/api/error";
import { refundCreditTarget } from "@/payment/refund-policy";
import {
  createPaypalRefund,
  queryPaypalRefundId,
  paypalConfig,
} from "@/payment/providers/paypal";
import {
  createWaffoRefund,
  queryWaffoRefunds,
  waffoConfig,
} from "@/payment/providers/waffo";
import type { RefundFact, RefundRequest } from "@/payment/providers/types";
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Order = typeof paymentOrders.$inferSelect;
type Package = typeof creditPackages.$inferSelect;
type Refund = typeof paymentRefunds.$inferSelect;
export const refundSchema = z
  .object({
    requestId: z.string().uuid(),
    orderId: z.string().uuid(),
    amount: z.number().int().positive().max(100000000),
    reason: z.string().trim().min(6).max(300),
  })
  .strict();
export const refundReviewSchema = z
  .object({
    requestId: z.string().uuid(),
    orderId: z.string().uuid(),
    reason: z.string().trim().min(12).max(300),
    acknowledgeLoss: z.literal(true),
  })
  .strict();
const pending = ["QUEUED", "SUBMITTING", "PENDING", "REVIEW"];
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const usable = (p: Package) =>
  p.status === "ACTIVE" && (!p.expiredAt || p.expiredAt > new Date());
async function balance(tx: Tx, userId: string) {
  const [r] = await tx
    .select({
      value:
        sql<number>`coalesce(sum(${creditPackages.remainingCredits}),0)`.mapWith(
          Number,
        ),
    })
    .from(creditPackages)
    .where(
      and(
        eq(creditPackages.userId, userId),
        eq(creditPackages.status, "ACTIVE"),
        or(
          isNull(creditPackages.expiredAt),
          gt(creditPackages.expiredAt, new Date()),
        ),
      ),
    );
  return r.value;
}
async function adminLock(tx: Tx, actorId: string, userId: string) {
  const rows = await tx
    .select()
    .from(users)
    .where(inArray(users.id, [...new Set([actorId, userId])]))
    .orderBy(asc(users.id))
    .for("update");
  const actor = rows.find((u) => u.id === actorId);
  if (!actor || actor.disabled || !actor.isAdmin || !actor.emailVerified)
    throw new ApiError("需要有效管理员权限", 403);
}
async function source(tx: Tx, orderId: string) {
  const [receipt] = await tx
    .select()
    .from(paymentFulfillments)
    .where(eq(paymentFulfillments.orderId, orderId));
  if (!receipt) throw new ApiError("订单尚未履约，不能按积分包自动退款", 409);
  const [pkg] = await tx
    .select()
    .from(creditPackages)
    .where(eq(creditPackages.id, receipt.packageId))
    .for("update");
  if (!pkg) throw new Error("Missing source package");
  return { receipt, pkg };
}
export async function refundView(orderId: string) {
  const [order] = await db
    .select()
    .from(paymentOrders)
    .where(eq(paymentOrders.id, orderId));
  if (!order) throw new ApiError("订单不存在", 404);
  const [receipt] = await db
    .select()
    .from(paymentFulfillments)
    .where(eq(paymentFulfillments.orderId, orderId));
  const [pkg] = receipt
    ? await db
        .select()
        .from(creditPackages)
        .where(eq(creditPackages.id, receipt.packageId))
    : [];
  const refunds = await db
    .select()
    .from(paymentRefunds)
    .where(eq(paymentRefunds.orderId, orderId))
    .orderBy(desc(paymentRefunds.createdAt));
  const reviews = await db
    .select()
    .from(paymentRefundReviews)
    .where(eq(paymentRefundReviews.orderId, orderId))
    .orderBy(desc(paymentRefundReviews.createdAt));
  return {
    order,
    paymentId: receipt?.paymentId,
    pkg,
    consumed: pkg
      ? Math.max(
          0,
          pkg.initialCredits -
            pkg.remainingCredits -
            pkg.frozenCredits -
            pkg.refundReservedCredits -
            pkg.refundReclaimedCredits,
        )
      : 0,
    refunds: refunds.map(({ leaseToken, requestHash, ...r }) => r),
    reviews: reviews.map(({ requestHash, ...r }) => r),
  };
}
export async function createRefund(
  actorId: string,
  input: z.infer<typeof refundSchema>,
) {
  const [hint] = await db
    .select()
    .from(paymentOrders)
    .where(eq(paymentOrders.id, input.orderId));
  if (!hint) throw new ApiError("订单不存在", 404);
  const fingerprint = hash({ actorId, ...input });
  return db.transaction(async (tx) => {
    await adminLock(tx, actorId, hint.userId);
    const [old] = await tx
      .select()
      .from(paymentRefunds)
      .where(eq(paymentRefunds.requestId, input.requestId));
    if (old) {
      if (old.requestHash !== fingerprint)
        throw new ApiError("退款请求编号不可更改内容", 409);
      return old;
    }
    const [order] = await tx
      .select()
      .from(paymentOrders)
      .where(eq(paymentOrders.id, input.orderId))
      .for("update");
    if (order.status !== "PAID") throw new ApiError("仅已支付订单可退款", 409);
    if (!["sandbox", "test"].includes(order.environment))
      throw new ApiError("本版后台只启用测试环境退款", 403);
    if (input.amount > order.amount - order.refundedAmount)
      throw new ApiError("超过订单剩余可退金额", 409);
    const current = await tx
      .select({ id: paymentRefunds.id })
      .from(paymentRefunds)
      .where(
        and(
          eq(paymentRefunds.orderId, order.id),
          inArray(paymentRefunds.status, pending),
        ),
      )
      .limit(1);
    if (current.length)
      throw new ApiError("该订单已有未完成退款，请先核实原退款", 409);
    const { receipt, pkg } = await source(tx, order.id);
    const target = refundCreditTarget(
      order.credits,
      order.refundedAmount + input.amount,
      order.amount,
    );
    const delta = target - order.refundCreditTarget;
    const consumed = Math.max(
      0,
      pkg.initialCredits -
        pkg.remainingCredits -
        pkg.frozenCredits -
        pkg.refundReservedCredits -
        pkg.refundReclaimedCredits,
    );
    const blocker =
      order.provider === "waffo" && order.refundedAmount > 0
        ? "Waffo 当前接口不支持同一收款的第二笔成功退款，请人工核对剩余金额"
        : pkg.frozenCredits > 0
          ? "来源积分仍有任务冻结，先等待任务完成；未调用支付平台退款"
          : consumed > 0
            ? "来源积分已有消费或失效，需人工审核；未调用支付平台退款"
            : !usable(pkg)
              ? "来源积分已到期或不可用，需人工审核；未调用支付平台退款"
              : pkg.remainingCredits < delta
                ? "来源积分不足，需人工审核；未调用支付平台退款"
                : null;
    const [r] = await tx
      .insert(paymentRefunds)
      .values({
        id: randomUUID(),
        requestId: input.requestId,
        requestHash: fingerprint,
        orderId: order.id,
        actorUserId: actorId,
        provider: order.provider,
        environment: order.environment,
        accountId: order.accountId,
        paymentId: receipt.paymentId,
        amount: input.amount,
        currency: order.currency,
        reason: input.reason,
        status: blocker ? "BLOCKED" : "QUEUED",
        reservedCredits: blocker ? 0 : delta,
        lastError: blocker,
      })
      .returning();
    if (!blocker) {
      await tx
        .update(creditPackages)
        .set({
          remainingCredits: sql`${creditPackages.remainingCredits}-${delta}`,
          refundReservedCredits: sql`${creditPackages.refundReservedCredits}+${delta}`,
          updatedAt: new Date(),
        })
        .where(eq(creditPackages.id, pkg.id));
      await tx
        .insert(creditTransactions)
        .values({
          transNo: `RH_${r.id}`,
          userId: order.userId,
          actorUserId: actorId,
          transType: "REFUND_HOLD",
          credits: -delta,
          balanceAfter: await balance(tx, order.userId),
          packageId: pkg.id,
          orderNo: order.id,
          refundId: r.id,
          remark: `测试退款待确认，预留来源积分 ${delta}；请求 ${r.id}`,
        });
    }
    return r;
  });
}
async function takeDebt(
  tx: Tx,
  order: Order,
  pkg: Package,
  refundId?: string,
  release = 0,
  actorId?: string,
) {
  const availableSource = pkg.remainingCredits + release;
  const needed = Math.max(
    0,
    order.refundCreditTarget -
      order.refundCreditsWaived -
      pkg.refundReclaimedCredits,
  );
  const take = Math.min(availableSource, needed);
  const debt = Math.max(0, needed - take);
  await tx
    .update(creditPackages)
    .set({
      remainingCredits: availableSource - take,
      refundReservedCredits: pkg.refundReservedCredits - release,
      refundReclaimedCredits: pkg.refundReclaimedCredits + take,
      updatedAt: new Date(),
    })
    .where(eq(creditPackages.id, pkg.id));
  await tx
    .update(paymentOrders)
    .set({ refundCreditShortfall: debt, updatedAt: new Date() })
    .where(eq(paymentOrders.id, order.id));
  if (take || release || refundId)
    await tx
      .insert(creditTransactions)
      .values({
        transNo: refundId
          ? `RC_${refundId}`
          : `RD_${order.id}_${pkg.refundReclaimedCredits + take}`,
        userId: order.userId,
        actorUserId: actorId,
        transType: "REFUND_RECLAIM",
        credits: usable(pkg) ? release - take : 0,
        balanceAfter: await balance(tx, order.userId),
        packageId: pkg.id,
        orderNo: order.id,
        refundId,
        remark: `现金退款来源积分回收 ${take}；仍待审核 ${debt}，不扣其他来源积分`,
      });
  return { take, debt };
}
export async function assertRefundUsageAllowed(tx: Tx, userId: string) {
  const [review] = await tx
    .select({ id: paymentOrders.id })
    .from(paymentOrders)
    .where(
      and(
        eq(paymentOrders.userId, userId),
        gt(paymentOrders.refundCreditShortfall, 0),
      ),
    )
    .limit(1);
  if (review)
    throw new ApiError(
      "退款积分尚待审核，暂不能提交新任务；已有任务仍可完成",
      403,
      { code: "REFUND_REVIEW_REQUIRED" },
    );
}
/** Caller holds the owner row. Reclaims only returned credits from their original source. */
export async function recoverRefundDebtForUser(tx: Tx, userId: string) {
  const rows = await tx
    .select()
    .from(paymentOrders)
    .where(
      and(
        eq(paymentOrders.userId, userId),
        gt(paymentOrders.refundCreditShortfall, 0),
      ),
    )
    .orderBy(asc(paymentOrders.id))
    .for("update");
  for (const order of rows) {
    const { pkg } = await source(tx, order.id);
    if (pkg.remainingCredits > 0) await takeDebt(tx, order, pkg);
  }
}
export async function receiveRefundFact(fact: RefundFact) {
  const [hint] = await db
    .select({ order: paymentOrders })
    .from(paymentFulfillments)
    .innerJoin(paymentOrders, eq(paymentOrders.id, paymentFulfillments.orderId))
    .where(
      and(
        eq(paymentFulfillments.provider, fact.provider),
        eq(paymentFulfillments.environment, fact.environment),
        eq(paymentFulfillments.accountId, fact.accountId),
        eq(paymentFulfillments.paymentId, fact.paymentId),
      ),
    );
  if (!hint) throw new ApiError("退款无法关联本站原收款", 409);
  return db.transaction(async (tx) => {
    await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, hint.order.userId))
      .for("update");
    const [order] = await tx
      .select()
      .from(paymentOrders)
      .where(eq(paymentOrders.id, hint.order.id))
      .for("update");
    let [r] = await tx
      .select()
      .from(paymentRefunds)
      .where(
        and(
          eq(paymentRefunds.provider, fact.provider),
          eq(paymentRefunds.environment, fact.environment),
          eq(paymentRefunds.accountId, fact.accountId),
          eq(paymentRefunds.externalId, fact.externalId),
        ),
      )
      .for("update");
    if (!r && fact.reference) {
      [r] = await tx
        .select()
        .from(paymentRefunds)
        .where(eq(paymentRefunds.id, fact.reference))
        .for("update");
    }
    if (
      r &&
      (r.orderId !== order.id ||
        r.paymentId !== fact.paymentId ||
        r.provider !== fact.provider ||
        r.environment !== fact.environment ||
        r.accountId !== fact.accountId ||
        r.amount !== fact.amount ||
        r.currency !== fact.currency ||
        (r.externalId && r.externalId !== fact.externalId))
    )
      throw new ApiError("退款金额、账户或原收款关联不一致", 409);
    if (fact.currency !== order.currency || fact.amount <= 0)
      throw new ApiError("退款币种或金额无效", 409);
    if (!r) {
      if (fact.status === "PENDING") return null;
      [r] = await tx
        .insert(paymentRefunds)
        .values({
          id: randomUUID(),
          requestId: `EXTERNAL_${fact.provider}_${fact.environment}_${fact.accountId}_${fact.externalId}`,
          requestHash: hash(fact),
          orderId: order.id,
          provider: fact.provider,
          environment: fact.environment,
          accountId: fact.accountId,
          paymentId: fact.paymentId,
          amount: fact.amount,
          currency: fact.currency,
          reason: "支付平台发起的外部退款，依据验签通知核对",
          status: "PENDING",
          externalId: fact.externalId,
        })
        .returning();
    }
    if (
      r.status === "SUCCEEDED" ||
      (r.status === "FAILED" && fact.status !== "SUCCEEDED")
    )
      return r;
    const { pkg } = await source(tx, order.id);
    if (fact.status === "SUCCEEDED") {
      const total = order.refundedAmount + fact.amount;
      if (total > order.amount)
        throw new ApiError("累计退款超过原收款，需人工核实", 409);
      const target = refundCreditTarget(order.credits, total, order.amount);
      await tx
        .update(paymentOrders)
        .set({ refundedAmount: total, refundCreditTarget: target })
        .where(eq(paymentOrders.id, order.id));
      const { take, debt } = await takeDebt(
        tx,
        { ...order, refundedAmount: total, refundCreditTarget: target },
        pkg,
        r.id,
        r.reservedCredits,
        r.actorUserId || undefined,
      );
      const [done] = await tx
        .update(paymentRefunds)
        .set({
          status: "SUCCEEDED",
          externalId: fact.externalId,
          reservedCredits: 0,
          reclaimedCredits: take,
          lastError: debt ? `来源积分不足 ${debt}，已限制新任务，需审核` : null,
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(paymentRefunds.id, r.id))
        .returning();
      return done;
    }
    if (fact.status === "FAILED") {
      if (r.reservedCredits) {
        await tx
          .update(creditPackages)
          .set({
            remainingCredits: sql`${creditPackages.remainingCredits}+${r.reservedCredits}`,
            refundReservedCredits: sql`${creditPackages.refundReservedCredits}-${r.reservedCredits}`,
            updatedAt: new Date(),
          })
          .where(eq(creditPackages.id, pkg.id));
        await tx
          .insert(creditTransactions)
          .values({
            transNo: `RL_${r.id}`,
            userId: order.userId,
            actorUserId: r.actorUserId,
            transType: "REFUND_RELEASE",
            credits: usable(pkg) ? r.reservedCredits : 0,
            balanceAfter: await balance(tx, order.userId),
            packageId: pkg.id,
            orderNo: order.id,
            refundId: r.id,
            remark: "支付平台确认退款失败，释放原来源预留；不延长原到期时间",
          });
      }
      const [done] = await tx
        .update(paymentRefunds)
        .set({
          status: "FAILED",
          externalId: fact.externalId,
          reservedCredits: 0,
          lastError: "支付平台确认退款失败",
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(paymentRefunds.id, r.id))
        .returning();
      await recoverRefundDebtForUser(tx, order.userId);
      return done;
    }
    const [updated] = await tx
      .update(paymentRefunds)
      .set({
        status: "PENDING",
        externalId: fact.externalId,
        updatedAt: new Date(),
      })
      .where(eq(paymentRefunds.id, r.id))
      .returning();
    return updated;
  });
}
export async function processRefund(id?: string) {
  const token = randomUUID();
  const r = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(paymentRefunds)
      .where(
        and(
          id ? eq(paymentRefunds.id, id) : undefined,
          inArray(paymentRefunds.status, ["QUEUED", "SUBMITTING", "PENDING"]),
          lt(paymentRefunds.nextCheckAt, new Date()),
          or(
            isNull(paymentRefunds.leaseUntil),
            lt(paymentRefunds.leaseUntil, new Date()),
          ),
        ),
      )
      .orderBy(asc(paymentRefunds.nextCheckAt))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!row) return null;
    await tx
      .update(paymentRefunds)
      .set({
        leaseToken: token,
        leaseUntil: new Date(Date.now() + 120000),
        status: row.status === "QUEUED" ? "SUBMITTING" : row.status,
      })
      .where(eq(paymentRefunds.id, row.id));
    return row;
  });
  if (!r) return false;
  try {
    const config = r.provider === "paypal" ? paypalConfig() : waffoConfig();
    if (
      config.environment !== r.environment ||
      config.accountId !== r.accountId
    )
      throw new ApiError("退款账户或环境已改变", 409);
    const req = { ...r, provider: r.provider as RefundRequest["provider"] };
    if (r.status === "QUEUED") {
      if (r.provider === "paypal") {
        const fact = await createPaypalRefund(req);
        await db
          .update(paymentRefunds)
          .set({
            externalId: fact.externalId,
            status: "PENDING",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(paymentRefunds.id, r.id),
              eq(paymentRefunds.leaseToken, token),
              eq(paymentRefunds.status, "SUBMITTING"),
            ),
          );
        await receiveRefundFact(fact);
      } else {
        const ticketId = await createWaffoRefund(req);
        await db
          .update(paymentRefunds)
          .set({ ticketId, status: "PENDING", updatedAt: new Date() })
          .where(
            and(
              eq(paymentRefunds.id, r.id),
              eq(paymentRefunds.leaseToken, token),
              eq(paymentRefunds.status, "SUBMITTING"),
            ),
          );
      }
    } else if (r.provider === "paypal" && r.externalId) {
      await receiveRefundFact(await queryPaypalRefundId(r.externalId));
    } else if (r.provider === "waffo") {
      const facts = await queryWaffoRefunds(req);
      for (const fact of facts) await receiveRefundFact(fact);
      if (!facts.length && r.status === "SUBMITTING")
        throw new ApiError("退款提交结果未知，禁止重复申请", 409);
    } else
      throw new ApiError(
        "退款回执未取得，等待通知或人工核实，禁止重复申请",
        409,
      );
    if (Date.now() - r.createdAt.getTime() > 86400000)
      await db
        .update(paymentRefunds)
        .set({
          status: "REVIEW",
          lastError: "退款等待超过一天，保留预留积分，需人工核实",
        })
        .where(
          and(
            eq(paymentRefunds.id, r.id),
            eq(paymentRefunds.status, "PENDING"),
          ),
        );
  } catch (e) {
    const retryQuery =
      r.status === "PENDING" && !(e instanceof ApiError && e.status === 409);
    await db
      .update(paymentRefunds)
      .set({
        status: retryQuery ? "PENDING" : "REVIEW",
        lastError:
          e instanceof ApiError && e.status === 409
            ? e.message
            : "退款结果暂未确认，保留预留积分；仅查询，不重复申请",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(paymentRefunds.id, r.id),
          inArray(paymentRefunds.status, ["SUBMITTING", "PENDING"]),
        ),
      );
  } finally {
    await db
      .update(paymentRefunds)
      .set({
        leaseToken: null,
        leaseUntil: null,
        nextCheckAt: new Date(Date.now() + 30000),
      })
      .where(
        and(eq(paymentRefunds.id, r.id), eq(paymentRefunds.leaseToken, token)),
      );
  }
  return true;
}
export async function recheckRefund(
  actorId: string,
  id: string,
  externalId?: string,
) {
  const [r] = await db
    .select()
    .from(paymentRefunds)
    .where(eq(paymentRefunds.id, id));
  if (!r) throw new ApiError("退款不存在", 404);
  const [order] = await db
    .select()
    .from(paymentOrders)
    .where(eq(paymentOrders.id, r.orderId));
  await db.transaction((tx) => adminLock(tx, actorId, order.userId));
  if (r.status === "SUCCEEDED" || r.status === "BLOCKED") return;
  if (r.provider === "paypal") {
    const ref = externalId || r.externalId;
    if (!ref)
      throw new ApiError(
        "未取得退款号，请先在 PayPal 核实并填入退款 ID；不会再次发起退款",
        409,
      );
    const fact = await queryPaypalRefundId(ref);
    if (!r.externalId && fact.reference !== r.id)
      throw new ApiError("退款回执不包含本请求关联，不能自动绑定", 409);
    if (
      fact.paymentId !== r.paymentId ||
      fact.amount !== r.amount ||
      fact.currency !== r.currency
    )
      throw new ApiError("退款回执与原请求不一致", 409);
    await receiveRefundFact(fact);
  } else {
    const facts = await queryWaffoRefunds({ ...r, provider: "waffo" });
    if (!facts.length)
      throw new ApiError(
        "尚未查到已执行退款，请稍后重查或检查平台退款工单；不会重复申请",
        409,
      );
    for (const f of facts) await receiveRefundFact(f);
  }
}
export async function waiveRefundLoss(
  actorId: string,
  input: z.infer<typeof refundReviewSchema>,
) {
  const [hint] = await db
    .select()
    .from(paymentOrders)
    .where(eq(paymentOrders.id, input.orderId));
  if (!hint) throw new ApiError("订单不存在", 404);
  const fingerprint = hash({ actorId, ...input });
  return db.transaction(async (tx) => {
    await adminLock(tx, actorId, hint.userId);
    const [old] = await tx
      .select()
      .from(paymentRefundReviews)
      .where(eq(paymentRefundReviews.requestId, input.requestId));
    if (old) {
      if (old.requestHash !== fingerprint)
        throw new ApiError("审核请求编号不可更改内容", 409);
      return old;
    }
    const [order] = await tx
      .select()
      .from(paymentOrders)
      .where(eq(paymentOrders.id, input.orderId))
      .for("update");
    const { pkg } = await source(tx, order.id);
    if (pkg.frozenCredits || pkg.refundReservedCredits)
      throw new ApiError("来源仍有冻结或退款预留，请先等待结算", 409);
    if (order.refundCreditShortfall <= 0)
      throw new ApiError("当前没有需要承担的退款积分差额", 409);
    const [r] = await tx
      .insert(paymentRefundReviews)
      .values({
        requestId: input.requestId,
        requestHash: fingerprint,
        orderId: order.id,
        actorUserId: actorId,
        reason: input.reason,
        waivedCredits: order.refundCreditShortfall,
      })
      .returning();
    await tx
      .update(paymentOrders)
      .set({
        refundCreditsWaived: sql`${paymentOrders.refundCreditsWaived}+${order.refundCreditShortfall}`,
        refundCreditShortfall: 0,
        updatedAt: new Date(),
      })
      .where(eq(paymentOrders.id, order.id));
    return r;
  });
}
