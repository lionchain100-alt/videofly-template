"use client";
import { useEffect, useState } from "react";
type RuntimeState = {
  ready: boolean;
  checks: { database: boolean; storage: boolean; workers: boolean };
  storageBackend?: string;
  checkedAt: string;
  workers: {
    kind: string;
    ready: boolean;
    instances: number;
    lastHeartbeat: string | null;
    lastProgress: string | null;
  }[];
};
export function RuntimeConsole() {
  const [data, setData] = useState<RuntimeState>(),
    [error, setError] = useState("");
  useEffect(() => {
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function check() {
      try {
        const r = await fetch("/api/v1/admin/runtime", {
            cache: "no-store",
            signal: controller.signal,
          }),
          b = await r.json();
        if (!r.ok) throw Error("Status unavailable");
        if (!stopped) {
          setData(b.data);
          setError("");
        }
      } catch {
        if (!stopped) setError("状态暂不可读，请检查服务连接");
      } finally {
        if (!stopped) timer = setTimeout(check, 5000);
      }
    }
    void check();
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, []);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">运行状态与就绪检查</h1>
      <p>每 5 秒刷新。数据库、私有存储和所需 Worker 均正常时，服务才就绪。</p>
      <p className="text-sm text-muted-foreground">
        心跳超过 30 秒即失效；循环进度上限：摘要和支付 3 分钟，视频 5 分钟。
      </p>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <p>
            总体：{data.ready ? "已就绪" : "未就绪"} · 数据库：
            {data.checks.database ? "正常" : "异常"} · 私有存储：
            {data.checks.storage ? "正常" : "异常"}（
            {data.storageBackend || "未知"}）
          </p>
          {data.workers.map((w) => (
            <section key={w.kind} className="rounded-xl border p-4">
              <h2>
                {(
                  {
                    text: "文本摘要",
                    video: "视频任务",
                    payments: "支付与退款",
                  } as Record<string, string>
                )[w.kind] || w.kind}
                ：{w.ready ? "正常" : "未运行或心跳／进度超时"}
              </h2>
              <p>
                有效实例 {w.instances} · 最近心跳{" "}
                {w.lastHeartbeat
                  ? new Date(w.lastHeartbeat).toLocaleString()
                  : "—"}
              </p>
              <p>
                最近循环进度{" "}
                {w.lastProgress
                  ? new Date(w.lastProgress).toLocaleString()
                  : "—"}
              </p>
            </section>
          ))}
          <p>检查时间：{new Date(data.checkedAt).toLocaleString()}</p>
        </>
      )}
    </div>
  );
}
