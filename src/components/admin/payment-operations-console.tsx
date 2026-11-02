"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { localePath } from "@/config/site-manifest";
import { adminStyles as s } from "./management";
type Row = Record<string, any>;
type Intent = {
  requestId: string;
  action: string;
  reason: string;
  orderId?: string;
  refundId?: string;
  event?: {
    provider: string;
    environment: string;
    accountId: string;
    eventId: string;
  };
};
const views = {
  orders: "订单与到账异常",
  events: "已验证事件／拒付审核",
  refunds: "退款异常",
  operations: "操作审计",
};
const actions: Record<string, string> = {
  REPLAY_EVENT: "重放已验证事件",
  RECONCILE_ORDER: "核对到账并补偿",
  RECHECK_REFUND: "只查询退款结果",
  REVIEW_EVENT: "记录人工审核确认",
};
export function PaymentOperationsConsole({ locale }: { locale: string }) {
  const [view, setView] = useState<keyof typeof views>("orders"),
    [q, setQ] = useState(""),
    [provider, setProvider] = useState(""),
    [exceptions, setExceptions] = useState(true),
    [page, setPage] = useState(1),
    [data, setData] = useState<{ rows: Row[]; hasNext: boolean } | null>(null),
    [selected, setSelected] = useState<Partial<Intent> | null>(null),
    [reason, setReason] = useState(""),
    [intent, setIntent] = useState<Intent | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const key = "payment-operation-intent";
  const loadVersion = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++loadVersion.current;
    const params = new URLSearchParams({
      view,
      q,
      provider,
      exceptions: exceptions ? "1" : "0",
      page: String(page),
    });
    const r = await fetch("/api/v1/admin/payment-ops?" + params, {
        cache: "no-store",
      }),
      b = await r.json();
    if (!r.ok) throw Error(b.error?.message || "查询失败");
    if (version === loadVersion.current) setData(b.data);
  }, [view, q, provider, exceptions, page]);
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(key);
      if (stored) setIntent(JSON.parse(stored));
    } catch {
      setMessage("本地操作草稿损坏，请刷新或清理本页草稿");
    }
  }, []);
  useEffect(() => {
    refresh().catch((e) => setMessage(e.message));
    const timer = setInterval(() => refresh().catch(() => {}), 5000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (!intent) return;
    const check = async () => {
      try {
        const r = await fetch(
          "/api/v1/admin/payment-ops?requestId=" + intent.requestId,
          { cache: "no-store" },
        );
        if (!r.ok) return;
        const op = (await r.json()).data;
        if (["SUCCEEDED", "NEEDS_REVIEW"].includes(op.status)) {
          setMessage(`${op.status} · ${op.message} · 审计编号 ${op.requestId}`);
          sessionStorage.removeItem(key);
          setIntent(null);
          setSelected(null);
          setReason("");
          await refresh();
        }
      } catch {}
    };
    const timer = setInterval(check, 3000);
    return () => clearInterval(timer);
  }, [intent, refresh]);
  async function submit() {
    if (!intent) return;
    setBusy(true);
    try {
      const r = await fetch("/api/v1/admin/payment-ops", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(intent),
        }),
        b = await r.json();
      if (!r.ok) throw Error(b.error?.message || "结果未确认，请重试同一编号");
      const op = b.data;
      setMessage(
        `${op.status} · ${op.message || "已进入持久操作队列"} · 审计编号 ${op.requestId}`,
      );
      if (["SUCCEEDED", "NEEDS_REVIEW"].includes(op.status)) {
        sessionStorage.removeItem(key);
        setIntent(null);
        setSelected(null);
        setReason("");
      }
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "结果未确认；请重试同一操作");
    } finally {
      setBusy(false);
    }
  }
  function choose(action: string, row: Row) {
    if (intent) {
      setMessage("请先核实尚未确认的操作，使用同一编号重试");
      return;
    }
    setReason("");
    setSelected(
      action === "RECONCILE_ORDER"
        ? { action, orderId: row.id }
        : action === "RECHECK_REFUND"
          ? { action, refundId: row.id }
          : {
              action,
              event: {
                provider: row.provider,
                environment: row.environment,
                accountId: row.account_id,
                eventId: row.event_id,
              },
            },
    );
  }
  function confirm() {
    if (!selected || reason.trim().length < 12) return;
    const next = {
      ...selected,
      requestId: crypto.randomUUID(),
      reason: reason.trim(),
    } as Intent;
    sessionStorage.setItem(key, JSON.stringify(next));
    setIntent(next);
    setSelected(null);
  }
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">支付异常与到账补偿</h1>
      <p className="text-sm text-muted-foreground">
        只使用本站保存的已验证事实或服务端只读查单。不会新扣款、再次退款或按商品预期金额手动发分。Waffo
        没有已验签实收通知时进入待核实；拒付审核确认不代表平台资金争议已解决。
      </p>
      {message && (
        <output className="block break-all rounded-xl border p-4">
          {message}
        </output>
      )}
      <div className="flex flex-wrap gap-2">
        {Object.entries(views).map(([id, label]) => (
          <button
            type="button"
            key={id}
            className={view === id ? s.primary : s.smallButton}
            onClick={() => {
              setView(id as keyof typeof views);
              setPage(1);
              setData(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3 rounded-xl border p-4">
        <label>
          订单／用户／实收号／事件号
          <input
            aria-label="异常搜索"
            className="block max-w-full rounded border bg-background p-2"
            value={q}
            maxLength={200}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          通道
          <select
            aria-label="支付通道"
            className="block rounded border bg-background p-2"
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value);
              setPage(1);
            }}
          >
            <option value="">全部</option>
            {["paypal", "waffo", "stripe", "creem"].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={exceptions}
            onChange={(e) => {
              setExceptions(e.target.checked);
              setPage(1);
            }}
          />{" "}
          只看异常／待处理
        </label>
        <button
          type="button"
          className={s.smallButton}
          onClick={() => refresh().catch((e) => setMessage(e.message))}
        >
          刷新查询
        </button>
      </div>
      {selected && (
        <section className="space-y-3 rounded-xl border p-4">
          <h2 className="font-semibold">{actions[selected.action!]}</h2>
          <p className="break-all">
            对象：
            {selected.orderId || selected.refundId || selected.event?.eventId}
          </p>
          <label>
            操作原因与核实依据（12–300 字）
            <textarea
              aria-label="操作原因与核实依据"
              className="mt-2 block w-full rounded border bg-background p-2"
              value={reason}
              maxLength={300}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button
            className={s.primary}
            type="button"
            disabled={reason.trim().length < 12}
            onClick={confirm}
          >
            核对操作
          </button>
          <button
            type="button"
            className={s.smallButton}
            onClick={() => setSelected(null)}
          >
            取消
          </button>
        </section>
      )}
      {intent && (
        <section className="space-y-3 rounded-xl border p-4">
          <p className="break-all">
            确认：{actions[intent.action]} ·{" "}
            {intent.orderId || intent.refundId || intent.event?.eventId}
          </p>
          <p>原因：{intent.reason}</p>
          <p className="break-all">
            请求编号：{intent.requestId}
            ；结果不明时保持此编号，不能改金额或支付事实。
          </p>
          <button
            type="button"
            className={s.primary}
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? "处理中…" : "确认提交／重试同一操作"}
          </button>
        </section>
      )}
      {!data ? (
        <p>正在查询…</p>
      ) : !data.rows.length ? (
        <p className="rounded-xl border p-6">暂无符合条件的记录</p>
      ) : (
        <div className="space-y-3">
          {data.rows.map((r, i) => (
            <article
              key={
                r.id ||
                `${r.provider}_${r.environment}_${r.account_id}_${r.event_id || i}`
              }
              className="space-y-2 rounded-xl border p-4"
            >
              <p className="break-all font-medium">
                {r.id || r.event_id} · {r.status}{" "}
                {r.review_status && `／${r.review_status}`}
              </p>
              <p className="break-all">
                {[r.provider, r.environment, r.email, r.event_type, r.action]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {r.order_id && (
                <Link
                  className="break-all underline"
                  href={localePath(locale, `/admin/orders/${r.order_id}`)}
                >
                  订单：{r.order_id}
                </Link>
              )}
              {r.payment_id && (
                <p className="break-all">原收款：{r.payment_id}</p>
              )}
              {r.currency && (
                <p>
                  {r.currency} {(r.amount / 100).toFixed(2)} ·{" "}
                  {r.credits !== undefined
                    ? `应发 ${r.credits} 积分 · ${r.payment_id ? "已有履约凭证" : "未见履约凭证"}`
                    : `预留 ${r.reserved_credits}／已回收 ${r.reclaimed_credits}`}
                </p>
              )}
              {r.source && (
                <p>
                  凭据来源：
                  {r.source === "SERVER_QUERY"
                    ? "服务端查单事实"
                    : "Webhook 已验证记录"}{" "}
                  · 处理尝试 {r.attempt_count}
                </p>
              )}
              {(r.last_error || r.message) && (
                <p className="break-all">{r.last_error || r.message}</p>
              )}
              {r.reason && <p>原因：{r.reason}</p>}
              {r.actor_user_id && (
                <p className="break-all">
                  操作者：{r.actor_user_id} · 请求编号 {r.request_id}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                {r.created_at ? new Date(r.created_at).toLocaleString() : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                {view === "orders" && (
                  <>
                    <button
                      type="button"
                      className={s.primary}
                      onClick={() => choose("RECONCILE_ORDER", r)}
                    >
                      核对到账并补偿
                    </button>
                    <Link
                      className={s.smallButton}
                      href={localePath(locale, `/admin/orders/${r.id}`)}
                    >
                      订单与退款管理
                    </Link>
                  </>
                )}
                {view === "events" && (
                  <>
                    <button
                      type="button"
                      className={s.primary}
                      onClick={() => choose("REPLAY_EVENT", r)}
                    >
                      重放已验证事件
                    </button>
                    <button
                      type="button"
                      className={s.smallButton}
                      onClick={() => choose("REVIEW_EVENT", r)}
                    >
                      记录审核确认
                    </button>
                  </>
                )}
                {view === "refunds" && (
                  <button
                    type="button"
                    className={s.smallButton}
                    onClick={() => choose("RECHECK_REFUND", r)}
                  >
                    只查询退款结果
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          className={s.smallButton}
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
        >
          上一页
        </button>
        <span>第 {page} 页</span>
        <button
          type="button"
          className={s.smallButton}
          disabled={!data?.hasNext}
          onClick={() => setPage((p) => p + 1)}
        >
          下一页
        </button>
      </div>
    </div>
  );
}
