import { and, eq, inArray } from "drizzle-orm";
import { db, paymentFulfillments } from "@/db";
import { ApiError } from "@/lib/api/error";
import { creemConfig, creemRequest } from "./creem";
import type { RefundFact, RefundRequest } from "./types";
const id = (v: any): string | undefined => (typeof v === "string" ? v : v?.id);
function mode(v: any) {
  if (v?.mode !== (creemConfig().environment === "test" ? "test" : "prod"))
    throw new ApiError("Creem 退款环境不匹配", 409);
}
async function transaction(paymentId: string) {
  let tx: any;
  if (paymentId.startsWith("ord_")) {
    const found = await creemRequest(
      `/v1/transactions/search?order_id=${encodeURIComponent(paymentId)}&page_size=2`,
    );
    if (
      found.items?.length !== 1 ||
      found.pagination?.total_records > 1 ||
      found.pagination?.total_pages > 1
    )
      throw new ApiError("Creem 原订单无法唯一关联交易", 409);
    tx = found.items[0];
    if (id(tx.order) !== paymentId)
      throw new ApiError("Creem 交易关联错误", 409);
  } else
    tx = await creemRequest(
      `/v1/transactions?transaction_id=${encodeURIComponent(paymentId)}`,
    );
  mode(tx);
  if (
    !id(tx)?.startsWith("tran_") ||
    (!paymentId.startsWith("ord_") && tx.id !== paymentId)
  )
    throw new ApiError("Creem 原交易凭证无效", 409);
  return tx;
}
async function fact(tx: any, reference?: string): Promise<RefundFact> {
  const c = creemConfig();
  mode(tx);
  const ids = [id(tx), id(tx.order)].filter((v): v is string => !!v);
  const rows = await db
    .select()
    .from(paymentFulfillments)
    .where(
      and(
        eq(paymentFulfillments.provider, "creem"),
        eq(paymentFulfillments.environment, c.environment),
        eq(paymentFulfillments.accountId, c.accountId),
        inArray(paymentFulfillments.paymentId, ids),
      ),
    );
  if (
    rows.length !== 1 ||
    tx.status !== "refunded" ||
    !Number.isSafeInteger(tx.amount) ||
    tx.amount <= 0 ||
    tx.amount_paid !== tx.amount ||
    tx.refunded_amount !== tx.amount_paid ||
    tx.currency?.toUpperCase() !== "USD"
  )
    throw new ApiError(
      "Creem 退款未确认为整笔无税收款，需人工核实，保留积分预留",
      409,
    );
  // The POST response has only status. Polling and webhook must share one identity.
  return {
    provider: "creem",
    environment: c.environment,
    accountId: c.accountId,
    paymentId: rows[0].paymentId,
    externalId: `creem_full_${tx.id}`,
    reference,
    amount: tx.amount,
    currency: tx.currency.toUpperCase(),
    status: "SUCCEEDED",
  };
}
export async function queryCreemRefund(
  request: RefundRequest,
): Promise<RefundFact | undefined> {
  const tx = await transaction(request.paymentId);
  if (tx.status !== "refunded") return;
  return fact(tx, request.id);
}
export async function createCreemRefund(
  request: RefundRequest,
): Promise<RefundFact | undefined> {
  const c = creemConfig();
  if (
    c.environment !== "test" ||
    request.environment !== c.environment ||
    request.accountId !== c.accountId
  )
    throw new ApiError("仅允许原测试账户退款", 409);
  const tx = await transaction(request.paymentId);
  if (
    tx.status !== "paid" ||
    tx.amount !== request.amount ||
    tx.amount_paid !== request.amount ||
    (tx.refunded_amount || 0) !== 0 ||
    tx.currency?.toUpperCase() !== request.currency
  )
    throw new ApiError("Creem 仅支持整笔无税收款退款，原交易需人工核对", 409);
  // Creem exposes no documented refund request idempotency key. Never resubmit.
  const response = await creemRequest("/v1/refunds", "POST", {
    transaction_id: tx.id,
  });
  if (["failed", "canceled"].includes(response.status))
    return {
      provider: "creem",
      environment: c.environment,
      accountId: c.accountId,
      paymentId: request.paymentId,
      externalId: `creem_failed_${request.id}`,
      reference: request.id,
      amount: request.amount,
      currency: request.currency,
      status: "FAILED",
    };
  if (!["succeeded", "pending", "requiresAction"].includes(response.status))
    throw new ApiError("Creem 退款回执需核实", 409);
  return queryCreemRefund(request);
}
export async function verifyCreemRefund(
  object: Record<string, any>,
): Promise<RefundFact> {
  mode(object);
  mode(object.transaction);
  if (!/^ref_/.test(object.id) || object.status !== "succeeded")
    throw new ApiError("Creem 退款通知尚未成功", 409);
  const tx = await transaction(id(object.transaction)!);
  const result = await fact(tx);
  result.providerRefundId = object.id;
  if (
    object.refund_amount !== result.amount ||
    object.refund_currency?.toUpperCase() !== result.currency ||
    object.transaction.id !== tx.id
  )
    throw new ApiError("Creem 退款金额或交易关联不一致", 409);
  return result;
}
