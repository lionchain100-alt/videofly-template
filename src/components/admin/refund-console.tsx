"use client";
import { siteManifest } from "@/config/site-manifest";
import { localePath } from "@/config/site-manifest";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { refundCreditTarget } from "@/payment/refund-policy";
import { cents, decimal } from "@/payment/providers/types";
import styles from "./management.module.css";

type Refund = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  reservedCredits: number;
  reclaimedCredits: number;
  externalId: string | null;
  ticketId: string | null;
  lastError: string | null;
  reason: string;
  actorUserId: string | null;
};
type View = {
  order: {
    id: string;
    userId: string;
    provider: string;
    environment: string;
    amount: number;
    currency: string;
    credits: number;
    refundedAmount: number;
    refundCreditTarget: number;
    refundCreditShortfall: number;
    refundCreditsWaived: number;
  };
  paymentId?: string;
  pkg?: {
    remainingCredits: number;
    frozenCredits: number;
    refundReservedCredits: number;
    refundReclaimedCredits: number;
    expiredAt: string | null;
  };
  consumed: number;
  refunds: Refund[];
  reviews: { requestId: string; reason: string; waivedCredits: number }[];
};
type Intent = {
  kind: "refund" | "review";
  requestId: string;
  orderId: string;
  amount?: number;
  reason: string;
  acknowledgeLoss?: true;
};
const labels: Record<string, string> = {
  BLOCKED: "已记录审核 / 未提交退款",
  QUEUED: "等待提交",
  SUBMITTING: "退款提交中",
  PENDING: "等待平台退款确认",
  SUCCEEDED: "现金退款成功",
  FAILED: "退款失败 / 已释放预留",
  REVIEW: "提交结果待核实 / 保留预留",
};
export function RefundConsole({
  orderId,
  locale,
}: { orderId: string; locale: string }) {
  const [view, setView] = useState<View | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [intent, setIntent] = useState<Intent | null>(null);
  const [busy, setBusy] = useState(false);
  const [loss, setLoss] = useState(false);
  const [externalIds, setExternalIds] = useState<Record<string, string>>({});
  const storage = `refund-intent-${orderId}`;
  const root = locale === siteManifest.languages.default ? "" : `/${locale}`;
  const refresh = useCallback(async () => {
    const r = await fetch(`/api/v1/admin/refunds/${orderId}`, {
      cache: "no-store",
    });
    const b = await r.json();
    if (!r.ok) throw new Error(b.error?.message || "订单暂不可读");
    setView(b.data);
  }, [orderId]);
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storage) || "null");
      if (saved?.orderId === orderId && typeof saved.requestId === "string") {
        setIntent(saved);
        setMessage("有一笔尚未确认的操作，请用同一请求重试。");
      }
    } catch {}
    void refresh().catch((e) => setMessage(e.message));
    const t = setInterval(() => {
      void refresh().catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [orderId, refresh, storage]);
  async function submit() {
    if (!intent || busy) return;
    setBusy(true);
    try {
      sessionStorage.setItem(storage, JSON.stringify(intent));
      const { kind, ...payload } = intent;
      const r = await fetch(
        kind === "refund"
          ? "/api/v1/admin/refunds"
          : "/api/v1/admin/refunds/review",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const b = await r.json();
      if (!r.ok) {
        if ([400, 401, 403, 409].includes(r.status)) {
          sessionStorage.removeItem(storage);
          setIntent(null);
        }
        throw new Error(b.error?.message || "结果未确认，请重试同一操作");
      }
      sessionStorage.removeItem(storage);
      setIntent(null);
      setMessage(
        kind === "refund"
          ? "请求已记录，请核对下方现金退款与积分处理状态。"
          : "审核损失已记录；其他来源积分未被扣除。",
      );
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "结果未确认，请重试同一操作");
    } finally {
      setBusy(false);
    }
  }
  async function recheck(r: Refund) {
    setBusy(true);
    try {
      const response = await fetch("/api/v1/admin/refunds/recheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refundId: r.id,
          ...(externalIds[r.id] ? { externalId: externalIds[r.id] } : {}),
        }),
      });
      const b = await response.json();
      if (!response.ok) throw new Error(b.error?.message || "查询失败");
      setMessage("已查询平台退款事实，没有重新申请退款。");
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "查询失败");
    } finally {
      setBusy(false);
    }
  }
  let amountCents = 0;
  try {
    amountCents = cents(amount);
  } catch {}
  const o = view?.order;
  const wanted =
    o && amountCents > 0 && amountCents <= o.amount - o.refundedAmount
      ? refundCreditTarget(
          o.credits,
          o.refundedAmount + amountCents,
          o.amount,
        ) - o.refundCreditTarget
      : 0;
  const blocked =
    !!view && (view.consumed > 0 || (view.pkg?.frozenCredits || 0) > 0);
  return (
    <div className="space-y-5">
      <Link href={`${root}/admin/orders`} className="underline">
        ← 返回充值订单
      </Link>
      <h1 className="text-2xl font-semibold">订单退款与积分回收</h1>
      {message && (
        <output className="block rounded-xl border p-4">{message}</output>
      )}
      {!view ? (
        <p>正在读取订单…</p>
      ) : (
        <>
          <section className="space-y-2 rounded-xl border p-5">
            <p className="break-all">订单：{o!.id}</p>
            <p>
              {o!.provider} / {o!.environment} · 原收款 {o!.currency}{" "}
              {decimal(o!.amount)} · 已退 {decimal(o!.refundedAmount)}
            </p>
            <p className="break-all">原收款号：{view.paymentId || "未履约"}</p>
            <p>
              来源可用 {view.pkg?.remainingCredits ?? 0} · 任务冻结{" "}
              {view.pkg?.frozenCredits ?? 0} · 已消费 / 失效 {view.consumed} ·
              退款预留 {view.pkg?.refundReservedCredits ?? 0} · 已回收{" "}
              {view.pkg?.refundReclaimedCredits ?? 0}
            </p>
            <p>
              待审核差额 {o!.refundCreditShortfall} · 已明确承担损失{" "}
              {o!.refundCreditsWaived}
            </p>
            <Link
              className="underline"
              href={`${root}/admin/credits?q=${orderId}`}
            >
              查看退款与充值流水 →
            </Link>
          </section>
          <section className="space-y-4 rounded-xl border p-5">
            <h2 className="text-lg font-semibold">发起测试退款</h2>
            <p className="text-sm text-muted-foreground">
              未消费且未冻结才自动退款。提交先预留来源积分；只有现金退款成功才结算回收。部分退款按累计金额向上取整。Waffo
              当前接口一笔收款只支持一笔成功退款。Creem 仅支持整笔无税收款退款。
            </p>
            {o!.provider === "creem" && (
              <p className="text-amber-700">
                Creem
                金额必须等于原收款全额；含税、部分退款或交易关联不清时转人工核对，不调用退款接口。
              </p>
            )}
            {blocked && (
              <p className="text-amber-700">
                来源已有消费、失效或任务冻结，提交只会记录审核原因，不调用退款接口。
              </p>
            )}
            <label className="block">
              退款金额（USD）
              <input
                aria-label="退款金额（USD）"
                className="ml-3 rounded border bg-background p-2"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={!!intent || busy}
              />
            </label>
            <label className="block">
              退款原因
              <textarea
                aria-label="退款原因"
                className="mt-2 block w-full rounded border bg-background p-2"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={!!intent || busy}
              />
            </label>
            <p>
              本次预计处理 {wanted}{" "}
              来源积分。现金未确认时保留预留，不会盲目再次退款。
            </p>
            {!intent ? (
              <button
                type="button"
                className={styles.primary}
                disabled={
                  busy ||
                  !amountCents ||
                  amountCents > o!.amount - o!.refundedAmount ||
                  (o!.provider === "creem" &&
                    (amountCents !== o!.amount || o!.refundedAmount > 0)) ||
                  reason.trim().length < 6
                }
                onClick={() =>
                  setIntent({
                    kind: "refund",
                    requestId: crypto.randomUUID(),
                    orderId,
                    amount: amountCents,
                    reason: reason.trim(),
                  })
                }
              >
                核对退款
              </button>
            ) : (
              <div className="space-y-3 rounded border p-4">
                <p>
                  {intent.kind === "refund"
                    ? `确认提交 USD ${decimal(intent.amount!)} 的测试退款；原因：${intent.reason}`
                    : `确认承担差额损失并解除限制；原因：${intent.reason}`}
                </p>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={busy}
                  onClick={() => void submit()}
                >
                  {busy
                    ? "处理中…"
                    : intent.kind === "refund"
                      ? "确认提交 / 重试同一退款"
                      : "确认承担损失 / 重试同一审核"}
                </button>
              </div>
            )}
          </section>
          {o!.refundCreditShortfall > 0 && !intent && (
            <section className="space-y-3 rounded-xl border p-5">
              <h2 className="font-semibold">退款已发生，来源积分不足</h2>
              <p>
                新任务已限制。被冻结任务可继续结算；失败释放到原包的积分会在同一事务中继续回收。不能从其他包补扣。
              </p>
              <p>
                任务全部结束后，可填写至少 12
                字审核原因，明确承担已消费损失。此操作不再退款、不增减其他来源积分，并永久保留审核记录。
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={loss}
                  onChange={(e) => setLoss(e.target.checked)}
                />{" "}
                确认承担不可追回的消费损失
              </label>
              <button
                type="button"
                className={styles.secondary}
                disabled={!loss || reason.trim().length < 12 || busy}
                onClick={() =>
                  setIntent({
                    kind: "review",
                    requestId: crypto.randomUUID(),
                    orderId,
                    reason: reason.trim(),
                    acknowledgeLoss: true,
                  })
                }
              >
                核对承担损失并解除限制
              </button>
            </section>
          )}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">退款记录</h2>
            {!view.refunds.length ? (
              <p>暂无退款记录</p>
            ) : (
              view.refunds.map((r) => (
                <article key={r.id} className="space-y-2 rounded-xl border p-4">
                  <strong>
                    {labels[r.status] || r.status} · USD {decimal(r.amount)}
                  </strong>
                  <p className="break-all">退款请求 {r.id}</p>
                  <p>
                    预留 {r.reservedCredits} · 本次回收 {r.reclaimedCredits}{" "}
                    积分
                  </p>
                  <p className="break-all">
                    外部退款号 {r.externalId || "待回执"} · 工单{" "}
                    {r.ticketId || "—"}
                  </p>
                  <p>原因：{r.reason}</p>
                  <p className="text-sm">
                    操作者：{r.actorUserId || "支付平台 / 系统"}
                  </p>
                  {r.lastError && <p>{r.lastError}</p>}
                  {["REVIEW", "PENDING", "SUBMITTING"].includes(r.status) && (
                    <div className="flex flex-wrap gap-3">
                      {["paypal", "stripe"].includes(o!.provider) &&
                        !r.externalId && (
                          <input
                            aria-label="待核实平台退款 ID"
                            className="rounded border bg-background p-2"
                            placeholder="平台退款 ID（不是原收款号）"
                            value={externalIds[r.id] || ""}
                            onChange={(e) =>
                              setExternalIds({
                                ...externalIds,
                                [r.id]: e.target.value,
                              })
                            }
                          />
                        )}
                      <button
                        type="button"
                        className={styles.secondary}
                        disabled={busy}
                        onClick={() => void recheck(r)}
                      >
                        只查询平台退款结果
                      </button>
                    </div>
                  )}
                </article>
              ))
            )}
          </section>
          {view.reviews.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-semibold">差额审核记录</h2>
              {view.reviews.map((r) => (
                <p key={r.requestId}>
                  承担 {r.waivedCredits} 积分损失 · {r.reason}
                </p>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
