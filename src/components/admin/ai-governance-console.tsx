"use client";
import { useEffect, useState, useRef } from "react";
import type { AiPolicy, AiProfile } from "@/ai/governance-contract";
const usd = (n: unknown) => "$" + (Number(n || 0) / 1e6).toFixed(6);
export function AiGovernanceConsole() {
  const [data, setData] = useState<any>();
  const [draft, setDraft] = useState<AiPolicy>();
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState({
      taskId: "",
      usd: "0",
      evidenceReference: "",
      reason: "",
    });
  const pending = useRef<{ fingerprint: string; id: string } | undefined>(
    undefined,
  );
  async function reload(signal?: AbortSignal) {
    const r = await fetch("/api/v1/admin/ai", { cache: "no-store", signal });
    const b = await r.json();
    if (!r.ok) throw Error(b.error?.message || "读取失败");
    setData(b.data);
    setDraft(b.data.policy.config);
  }
  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal).catch((e) => {
      if (!controller.signal.aborted) setMessage(e.message);
    });
    return () => controller.abort();
  }, []);
  async function send(command: any) {
    const fingerprint = JSON.stringify(command);
    if (pending.current?.fingerprint !== fingerprint)
      pending.current = { fingerprint, id: crypto.randomUUID() };
    setBusy(true);
    try {
      const r = await fetch("/api/v1/admin/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...command, requestId: pending.current.id }),
        });
      const b = await r.json();
      if (!r.ok) throw Error(b.error?.message || "保存失败");
      pending.current = undefined;
      await reload();
      setMessage(
        b.data.replayed ? "此前操作已完成，未重复执行" : "已保存，审计已记录",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "操作失败，可重试同一请求");
    } finally {
      setBusy(false);
    }
  }
  function profile(id: string, patch: Partial<AiProfile>) {
    setDraft(
      (d) =>
        d && {
          ...d,
          profiles: d.profiles.map((p) =>
            p.id === id ? { ...p, ...patch } : p,
          ),
        },
    );
  }
  if (!draft || !data)
    return <output className="block">{message || "正在读取模型策略…"}</output>;
  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-semibold">模型与费用控制</h1>
      <p>
        预算按 UTC
        日／月计算，包含未决调用的保留额度。积分售价与供应商成本分别记录；修改只影响新任务。
      </p>
      <output className="block break-words">
        {message}
      </output>
      <div className="flex flex-wrap gap-4 rounded-xl border p-4">
        <span>
          今日占用 {usd(data.totals.daily)} / {usd(draft.dailyMicros)}
        </span>
        <span>
          本月占用 {usd(data.totals.monthly)} / {usd(draft.monthlyMicros)}
        </span>
        <span>待查看费用 {data.totals.reviews}</span>
        <button
          type="button"
          className="underline"
          onClick={() => void reload().catch((e) => setMessage(e.message))}
        >
          重新载入
        </button>
      </div>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void send({
            action: "policy",
            expectedRevision: data.policy.revision,
            reason,
            config: draft,
          });
        }}
      >
        <fieldset
          disabled={busy}
          className="grid gap-4 sm:grid-cols-2 rounded-xl border p-4"
        >
          <legend>限额与预算 · 当前版本 {data.policy.revision}</legend>
          {(
            ["perMinute", "perDay", "dailyMicros", "monthlyMicros"] as const
          ).map((k) => (
            <label key={k} className="flex flex-col gap-1">
              {
                {
                  perMinute: "每用户每分钟新任务",
                  perDay: "每用户每天新任务",
                  dailyMicros: "站点每日预算（美元）",
                  monthlyMicros: "站点每月预算（美元）",
                }[k]
              }
              <input
                className="rounded border p-2 w-full"
                type="number"
                min={k.endsWith("Micros") ? 0 : 1}
                step={k.endsWith("Micros") ? "0.000001" : 1}
                required
                value={k.endsWith("Micros") ? draft[k] / 1e6 : draft[k]}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    [k]: Math.round(
                      Number(e.target.value) * (k.endsWith("Micros") ? 1e6 : 1),
                    ),
                  })
                }
              />
            </label>
          ))}
        </fieldset>
        {draft.profiles.map((p) => (
          <fieldset
            key={p.id}
            disabled={busy}
            className="rounded-xl border p-4 space-y-3"
          >
            <legend>
              {p.label} · {p.id}
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                显示名称
                <input
                  className="block w-full border rounded p-2"
                  value={p.label}
                  onChange={(e) => profile(p.id, { label: e.target.value })}
                />
              </label>
              <label>
                模型 ID
                <input
                  className="block w-full border rounded p-2"
                  value={p.model}
                  disabled={p.toolId === "video-generation"}
                  onChange={(e) => profile(p.id, { model: e.target.value })}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={p.enabled}
                  onChange={(e) => profile(p.id, { enabled: e.target.checked })}
                />{" "}
                启用新任务
              </label>
              <label>
                <input
                  type="radio"
                  name={"default-" + p.toolId}
                  checked={draft.defaults[p.toolId] === p.id}
                  onChange={() =>
                    setDraft({
                      ...draft,
                      defaults: { ...draft.defaults, [p.toolId]: p.id },
                    })
                  }
                />{" "}
                默认模型
              </label>
              {(
                [
                  "credits",
                  "sort",
                  ...(p.toolId === "text-summary"
                    ? [
                        "maxTokens",
                        "timeoutMs",
                        "inputUsdPerMillion",
                        "outputUsdPerMillion",
                      ]
                    : ["fixedMicros"]),
                ] as const
              ).map((k) => (
                <label key={k}>
                  {
                    (
                      {
                        credits: "每任务售价（积分）",
                        sort: "显示排序",
                        maxTokens: "最大输出 token",
                        timeoutMs: "超时（毫秒）",
                        inputUsdPerMillion: "输入估算价（美元／百万 token）",
                        outputUsdPerMillion: "输出估算价（美元／百万 token）",
                        fixedMicros: "每视频估算费用（百万分之一美元）",
                      } as Record<string, string>
                    )[k]
                  }
                  <input
                    className="block w-full border rounded p-2"
                    type="number"
                    step={k.includes("Usd") ? "0.000001" : 1}
                    value={Number(p[k as keyof AiProfile])}
                    onChange={(e) =>
                      profile(p.id, { [k]: Number(e.target.value) })
                    }
                  />
                </label>
              ))}
              <label className="sm:col-span-2">
                价格来源／核对日期
                <input
                  className="block w-full border rounded p-2"
                  value={p.priceSource}
                  onChange={(e) =>
                    profile(p.id, { priceSource: e.target.value })
                  }
                />
              </label>
            </div>
            <p className="text-sm">
              {p.toolId === "video-generation"
                ? "固定 5 秒／1080p；16:9 有真实验收，9:16 保留兼容范围，尚待真实验收。"
                : "模型 ID 需在本地 TEXT_AI_ALLOWED_MODELS 白名单；密钥和接口地址仍仅在本地环境配置。"}
            </p>
          </fieldset>
        ))}
        <button
          type="button"
          disabled={busy || draft.profiles.length >= 20}
          className="border rounded p-2"
          onClick={() => {
            const p = draft.profiles.find((p) => p.toolId === "text-summary")!;
            setDraft({
              ...draft,
              profiles: [
                ...draft.profiles,
                {
                  ...p,
                  id: "summary-" + crypto.randomUUID().slice(0, 8),
                  label: "新的文本模型配置",
                  enabled: false,
                },
              ],
            });
          }}
        >
          添加文本模型配置
        </button>
        <label className="block">
          变更原因（12–300 字符）
          <textarea
            className="block w-full border rounded p-2"
            required
            minLength={12}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button type="submit"
          className="rounded bg-primary text-primary-foreground px-4 py-2"
          disabled={busy}
        >
          保存新版本
        </button>
      </form>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">最近 100 条费用记录</h2>
        <p>
          用量推算和保守占用都属于估算。只有管理员核对供应商账单后，才标为人工确认；超时／失败不自动认定供应商免费。
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full text-sm">
            <thead>
              <tr>
                <th>任务</th>
                <th>状态／异常</th>
                <th>预留</th>
                <th>token 推算</th>
                <th>预算占用</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {data.costs.map((c: any) => (
                <tr key={c.task_id} className="border-t">
                  <td className="p-2">
                    <span title={c.task_id}>{c.task_id.slice(0, 8)}</span>
                    <br />
                    {c.profile_snapshot.model}
                  </td>
                  <td className="p-2">
                    {c.status}
                    <br />
                    {c.anomaly || "—"}
                  </td>
                  <td>{usd(c.estimate_micros)}</td>
                  <td>{c.usage_micros === null ? "—" : usd(c.usage_micros)}</td>
                  <td>{usd(c.charged_micros)}</td>
                  <td>
                    <button
                      type="button"
                      className="underline"
                      onClick={() =>
                        setReview({
                          ...review,
                          taskId: c.task_id,
                          usd: String(Number(c.charged_micros) / 1e6),
                        })
                      }
                    >
                      核对费用
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <form
        className="space-y-3 rounded-xl border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send({
            action: "review",
            taskId: review.taskId,
            amountMicros: Math.round(Number(review.usd) * 1e6),
            reason: review.reason,
            evidenceReference: review.evidenceReference,
          });
        }}
      >
        <h2 className="font-semibold">人工费用核对（不修改积分或支付）</h2>
        <p>
          仅处理终态任务。请填写可追溯的账单／收据编号，不填写密钥。执行中或结果不确定的视频先在原任务后台完成核实。
        </p>
        {(["taskId", "usd", "evidenceReference", "reason"] as const).map(
          (k) => (
            <label key={k} className="block">
              {
                {
                  taskId: "完整任务 ID",
                  usd: "已核实美元费用",
                  evidenceReference: "供应商凭证／账单编号",
                  reason: "核对原因（至少 12 字符）",
                }[k]
              }
              <input
                className="block w-full border rounded p-2"
                required
                type={k === "usd" ? "number" : "text"}
                min={k === "usd" ? 0 : undefined}
                step={k === "usd" ? "0.000001" : undefined}
                value={review[k]}
                onChange={(e) => setReview({ ...review, [k]: e.target.value })}
              />
            </label>
          ),
        )}
        <button type="submit" className="border rounded p-2" disabled={busy}>
          确认费用并记审计
        </button>
      </form>
      <section>
        <h2 className="text-xl font-semibold">配置历史（最近 30 版）</h2>
        {data.versions.map((v: any) => (
          <p className="break-words border-b py-2" key={v.id}>
            版本 {v.revision} · {v.origin} · {v.reason} ·{" "}
            {new Date(v.created_at).toLocaleString()}
          </p>
        ))}
      </section>
      <details>
        <summary>能力验收与旧链路边界</summary>
        <pre className="whitespace-pre-wrap break-words text-sm">
          {JSON.stringify(data.capabilities, null, 2)}
        </pre>
      </details>
      <details>
        <summary>费用核对审计与限额拒绝记录</summary>
        <pre className="whitespace-pre-wrap break-words text-sm">
          {JSON.stringify(
            { reviews: data.reviews, incidents: data.incidents },
            null,
            2,
          )}
        </pre>
      </details>
    </div>
  );
}
