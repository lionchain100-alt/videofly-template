"use client";
import { useEffect, useState } from "react";
type Provider = "stripe" | "creem";
type Plan = {
  id: string;
  name: string;
  amount: number;
  credits: number;
  period: string;
  providers: Provider[];
};
type Subscription = {
  id: string;
  provider: Provider;
  productId: string;
  productName: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  periodEnd: string;
  paidThrough: string | null;
  hasAccess: boolean;
};
export function SubscriptionWorkspace() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [providers, setProviders] = useState<{ id: Provider; enabled: boolean }[]>(
      [],
    );
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [provider, setProvider] = useState<Provider>("creem");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState<{
    requestId: string;
    provider: Provider;
    productId: string;
  } | null>(null);
  async function refresh() {
    const r = await fetch("/api/v1/subscriptions", { cache: "no-store" });
    if (r.ok) setSubs((await r.json()).data);
  }
  useEffect(() => {
    void fetch("/api/v1/payments")
      .then((r) => r.json())
      .then((r) => {
        setPlans(r.data.subscriptions || []);
        const p = r.data.providers.filter((p: any) =>
          ["stripe", "creem"].includes(p.id),
        );
        setProviders(p);
        setProvider(p.find((p: any) => p.enabled)?.id || "creem");
      });
    void refresh();
    try {
      const saved = JSON.parse(
        sessionStorage.getItem("billing-subscription-intent-v1") || "null",
      );
      if (saved && ["stripe", "creem"].includes(saved.provider))
        setIntent(saved);
    } catch {}
  }, []);
  async function checkout(productId: string) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const request = intent || {
        requestId: crypto.randomUUID(),
        provider,
        productId,
      };
      if (request.productId !== productId || request.provider !== provider)
        throw Error("存在未确认的订阅请求，请先重试原请求或清除本地请求记录。");
      setIntent(request);
      sessionStorage.setItem(
        "billing-subscription-intent-v1",
        JSON.stringify(request),
      );
      const response = await fetch("/api/v1/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });
      const body = await response.json();
      if (!response.ok) {
        if ([400, 401, 403, 409, 429, 503].includes(response.status)) {
          sessionStorage.removeItem("billing-subscription-intent-v1");
          setIntent(null);
        }
        throw Error(body.error?.message || "订阅订单创建失败");
      }
      const order = body.data.order;
      if (order.status === "PAID") {
        sessionStorage.removeItem("billing-subscription-intent-v1");
        setIntent(null);
        setMessage("该账单已到账，无需再次付款。");
      } else if (order.checkoutUrl) {
        window.location.assign(order.checkoutUrl);
      } else setMessage(`订单 ${order.id} 正在确认收银台，请重试同一请求。`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }
  async function change(id: string, action: "cancel" | "resume") {
    setBusy(true);
    try {
      const r = await fetch("/api/v1/subscriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, action }),
        });
      const body = await r.json();
      if (!r.ok) throw Error(body.error?.message || "订阅操作失败");
      setSubs(body.data);
      setMessage(
        action === "cancel"
          ? "已向平台确认期末取消；已付周期和已有积分保留。"
          : "已同步平台的恢复结果；恢复操作本身不会发积分。",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mx-auto max-w-6xl px-6 py-10" aria-label="订阅管理">
      <h2 className="text-2xl font-semibold">订阅与每期积分</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        每期实际付款核实后发放一次积分。取消或恢复不发积分；取消保留已付周期及原积分有效期。
      </p>
      <div className="my-5 flex flex-wrap gap-4">
        {providers.map((p) => (
          <label key={p.id}>
            <input
              type="radio"
              name="subscription-provider"
              checked={provider === p.id}
              disabled={!p.enabled || busy}
              onChange={() => setProvider(p.id)}
            />{" "}
            {p.id === "creem" ? "Creem" : "Stripe"} ·{" "}
            {p.enabled ? "已配置" : "尚未配置"}
          </label>
        ))}
      </div>
      {intent && (
        <p className="mb-4 text-sm">
          已有未确认请求。
          <button type="button"
            onClick={() => {
              sessionStorage.removeItem("billing-subscription-intent-v1");
              setIntent(null);
            }}
          >
            清除本地请求记录
          </button>
          （不会取消已创建的平台订单）
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <article key={plan.id} className="rounded-xl border p-5">
            <h3 className="font-semibold">{plan.name}</h3>
            <p>
              ${(plan.amount / 100).toFixed(2)} /{" "}
              {plan.period === "year" ? "年" : "月"} · {plan.credits} 积分
            </p>
            <button type="button"
              className="mt-4 rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
              disabled={
                busy ||
                !providers.find((p) => p.id === provider)?.enabled ||
                !plan.providers.includes(provider)
              }
              onClick={() => checkout(plan.id)}
            >
              订阅
            </button>
          </article>
        ))}
      </div>
      {message && (
        <output className="block mt-4">
          {message}
        </output>
      )}
      <h3 className="mt-8 text-lg font-semibold">我的订阅</h3>
      <button type="button" className="my-3 text-sm underline" onClick={() => void refresh()}>
        刷新订阅状态
      </button>
      {!subs.length && (
        <p className="text-sm text-muted-foreground">
          暂无已关联的订阅。请登录后查看；未配置的通道不会发起支付。
        </p>
      )}
      {subs.map((sub) => (
        <article className="mb-3 rounded border p-4 text-sm" key={sub.id}>
          <p>
            {sub.productName} · {sub.provider} · {sub.status}{" "}
            {sub.cancelAtPeriodEnd ? "（已安排期末取消）" : ""}
          </p>
          <p>
            已付周期至：
            {sub.paidThrough
              ? new Date(sub.paidThrough).toLocaleString()
              : "等待核实付款"}
          </p>
          <p>{sub.hasAccess ? "已付权益有效" : "当前无有效已付权益"}</p>
          {!["canceled", "expired", "incomplete_expired"].includes(
            sub.status,
          ) &&
            !(sub.provider === "stripe" && sub.status === "paused") && (
              <button type="button"
                disabled={busy}
                className="mt-2 underline"
                onClick={() =>
                  void change(
                    sub.id,
                    sub.cancelAtPeriodEnd || sub.status === "paused"
                      ? "resume"
                      : "cancel",
                  )
                }
              >
                {sub.cancelAtPeriodEnd || sub.status === "paused"
                  ? "恢复续费"
                  : "期末取消续费"}
              </button>
            )}
        </article>
      ))}
    </section>
  );
}
