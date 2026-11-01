"use client";
import { siteManifest } from "@/config/site-manifest";
import { localePath } from "@/config/site-manifest";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCreditsStore } from "@/stores/credits-store";

type Order = {
  id: string;
  productName: string;
  provider: string;
  environment: string;
  amount: number;
  currency: string;
  credits: number;
  status: string;
  checkoutUrl: string | null;
  createdAt: string;
  paidAt: string | null;
  refundedAmount: number;
};
type Catalog = {
  products: {
    id: string;
    name: string;
    amount: number;
    currency: string;
    credits: number;
    expiryDays: number;
  }[];
  providers: {
    id: "paypal" | "waffo";
    enabled: boolean;
    environment: string;
  }[];
};
type Intent = {
  requestId: string;
  provider: "paypal" | "waffo";
  productId: string;
};
const labels: Record<string, string> = {
  CREATING: "正在创建收银台",
  PENDING: "等待支付确认",
  PAID: "已到账并发放积分",
  REVIEW: "需要核实，请联系管理员",
};
const intentKey = "credit-purchase-intent-v1";
export function PurchaseWorkspace({ locale }: { locale: string }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [auth, setAuth] = useState<boolean | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [selected, setSelected] = useState("");
  const mutex = useRef(false);
  const root = locale === siteManifest.languages.default ? "" : `/${locale}`;
  const sync = useCallback(async () => {
    const res = await fetch("/api/v1/payments/orders", { cache: "no-store" });
    if (res.status === 401) {
      setAuth(false);
      return;
    }
    if (!res.ok) throw new Error("订单暂时无法读取");
    setOrders((await res.json()).data);
    setAuth(true);
    const balance = await fetch("/api/v1/credit/balance", {
      cache: "no-store",
    });
    if (balance.ok)
      useCreditsStore.getState().setBalance((await balance.json()).data);
  }, []);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setSelected(q.get("order") || "");
    if (q.get("cancelled"))
      setMessage(
        "你已离开收银台。订单仍会查询实际状态，不会因回跳参数发积分。",
      );
    try {
      const saved = JSON.parse(sessionStorage.getItem(intentKey) || "null");
      if (
        saved &&
        typeof saved.requestId === "string" &&
        ["paypal", "waffo"].includes(saved.provider) &&
        typeof saved.productId === "string"
      )
        setIntent(saved);
    } catch {}
    void fetch("/api/v1/payments", { cache: "no-store" })
      .then((r) => r.json())
      .then((r) => setCatalog(r.data))
      .catch(() => setMessage("支付配置暂时无法读取"));
    void sync().catch((e) => setMessage(e.message));
    const interval = setInterval(() => {
      void sync().catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [sync]);
  async function purchase(data: Intent) {
    if (mutex.current) return;
    mutex.current = true;
    setBusy(true);
    setMessage("");
    try {
      sessionStorage.setItem(intentKey, JSON.stringify(data));
      setIntent(data);
      const res = await fetch("/api/v1/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await res.json();
      if (!res.ok) {
        if ([400, 401, 403, 409, 429, 503].includes(res.status)) {
          sessionStorage.removeItem(intentKey);
          setIntent(null);
        }
        throw new Error(body.error?.message || "请求尚未确认，请重试同一购买");
      }
      const order = body.data.order as Order;
      sessionStorage.removeItem(intentKey);
      setIntent(null);
      setSelected(order.id);
      window.history.replaceState(
        {},
        "",
        `${root}/buy-credits?order=${order.id}`,
      );
      await sync();
      if (order.checkoutUrl && order.status === "PENDING")
        window.location.assign(order.checkoutUrl);
      else setMessage("订单已保存，请稍候查看收银台或到账状态。无需重复创建。");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "请求中断，请重试同一购买");
    } finally {
      setBusy(false);
      mutex.current = false;
    }
  }
  async function refresh(id: string) {
    if (mutex.current) return;
    mutex.current = true;
    setBusy(true);
    try {
      const r = await fetch(`/api/v1/payments/orders/${id}/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!r.ok) throw new Error("查询暂未完成，请稍后重试");
      await sync();
      setMessage("已查询支付状态；仅在到账确认后发放积分。");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "查询失败");
    } finally {
      setBusy(false);
      mutex.current = false;
    }
  }
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-5 py-12">
      <header className="space-y-3">
        <Link
          className="text-sm text-muted-foreground underline"
          href={root || "/"}
        >
          ← 返回工具首页
        </Link>
        <h1 className="text-3xl font-semibold">购买积分</h1>
        <p className="text-muted-foreground">
          一次性购买，365 天有效。付款完成后自动到账，可用于文本摘要和视频生成。
        </p>
        <p className="text-sm text-muted-foreground">
          Sandbox / test 为测试支付，不发生真实扣款。正式收款仅在通道切换至 live
          / prod 后启用。
        </p>
      </header>
      {message && (
        <output className="block rounded-xl border p-4">{message}</output>
      )}
      {auth === false && (
        <p>
          请先{" "}
          <Link href={`${root}/login`} className="underline">
            登录账户
          </Link>
          ，再购买积分。
        </p>
      )}
      {intent && (
        <div className="rounded-xl border p-4">
          <p>有一笔提交尚未确认，请先恢复同一购买。</p>
          <button
            type="button"
            disabled={busy}
            className="mt-3 rounded-lg border px-4 py-2"
            onClick={() => void purchase(intent)}
          >
            重试同一购买
          </button>
        </div>
      )}
      {!catalog ? (
        <p>正在读取积分包…</p>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {catalog.products.map((p) => (
            <section
              key={p.id}
              className="space-y-4 rounded-2xl border bg-card p-6"
            >
              <h2 className="text-xl font-medium">{p.name}</h2>
              <p className="text-3xl font-semibold">
                {p.credits} <span className="text-base font-normal">积分</span>
              </p>
              <p>
                {p.currency} {(p.amount / 100).toFixed(2)} · {p.expiryDays}{" "}
                天有效
              </p>
              <div className="flex flex-wrap gap-3">
                {catalog.providers.map((provider) => (
                  <button
                    type="button"
                    key={provider.id}
                    disabled={
                      !provider.enabled || auth !== true || busy || !!intent
                    }
                    onClick={() =>
                      void purchase({
                        requestId: crypto.randomUUID(),
                        provider: provider.id,
                        productId: p.id,
                      })
                    }
                    className="rounded-lg border px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {provider.id === "paypal" ? "PayPal" : "Waffo"} ·{" "}
                    {provider.enabled ? provider.environment : "尚未启用"}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">我的购买记录</h2>
          <Link className="underline" href={`${root}/credits`}>
            查看积分余额与流水
          </Link>
        </div>
        {orders.length === 0 ? (
          <p className="text-muted-foreground">
            暂无购买记录。通道配置完成后可进行测试。
          </p>
        ) : (
          orders.map((o) => (
            <article
              key={o.id}
              className={`space-y-3 rounded-xl border p-5 ${selected === o.id ? "ring-1 ring-primary" : ""}`}
            >
              <div className="flex flex-wrap justify-between gap-2">
                <strong>
                  {o.productName} · {o.credits} 积分
                </strong>
                <span>{labels[o.status] || o.status}</span>
              </div>
              <p className="text-sm">
                {o.provider} / {o.environment} · {o.currency}{" "}
                {(o.amount / 100).toFixed(2)}
                {o.refundedAmount > 0 &&
                  ` · 已退款 ${(o.refundedAmount / 100).toFixed(2)}，对应积分已按退款规则处理`}
              </p>
              <p className="break-all text-xs text-muted-foreground">
                订单 {o.id}
              </p>
              <div className="flex flex-wrap gap-4">
                {o.status === "PENDING" && o.checkoutUrl && (
                  <a className="underline" href={o.checkoutUrl}>
                    前往收银台
                  </a>
                )}
                {["CREATING", "PENDING"].includes(o.status) && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void refresh(o.id)}
                    className="underline disabled:opacity-50"
                  >
                    查询到账状态
                  </button>
                )}
                {o.status === "PAID" && (
                  <Link className="underline" href={`${root}/credits`}>
                    查看入账积分
                  </Link>
                )}
              </div>
              {o.provider === "waffo" && o.status === "PENDING" && (
                <p className="text-xs text-muted-foreground">
                  Waffo 需收到验签成功的到账通知才会发放积分；付款后请稍候。
                </p>
              )}
            </article>
          ))
        )}
      </section>
    </div>
  );
}
