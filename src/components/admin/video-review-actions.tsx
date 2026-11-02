"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import s from "./management.module.css";
type Intent = {
  requestId: string;
  taskId: string;
  action: string;
  reason: string;
  providerTaskId?: string;
  acknowledgeNoResult?: boolean;
};
export function VideoReviewActions({ taskId, hasResult }: { taskId: string; hasResult: boolean }) {
  const router = useRouter();
  const key = `video-review-${taskId}`;
  const [action, setAction] = useState(hasResult ? "RETRY_STORAGE" : "LINK_TASK");
  const [reason, setReason] = useState("");
  const [external, setExternal] = useState("");
  const [ack, setAck] = useState(false);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || "null");
      if (saved?.taskId === taskId) {
        setIntent(saved);
        setMessage("上次操作尚未确认，请重试同一操作。");
      }
    } catch {}
  }, [key, taskId]);
  async function send() {
    if (!intent || busy) return;
    try {
      sessionStorage.setItem(key, JSON.stringify(intent));
    } catch {
      setMessage("请允许会话存储以安全重试。");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/v1/admin/video-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(intent),
      });
      const body = await response.json();
      if (!response.ok) {
        if ([400, 404, 409].includes(response.status)) {
          sessionStorage.removeItem(key);
          setIntent(null);
        }
        setMessage(body.error?.message || "未确认，请重试同一操作。");
        return;
      }
      sessionStorage.removeItem(key);
      setIntent(null);
      setMessage("处理已保存。调度器会继续查询或保存；确认失败则已释放积分。");
      router.refresh();
    } catch {
      setMessage("响应中断，请重试同一操作，不会重复处理。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <p className={s.notice}>
        请先在 Kie
        控制台核对本任务。关联编号会校验原模型与提示词；已有成功结果只可重试保存。释放积分必须填写未产出结果的核实依据。
      </p>
      {intent ? (
        <div className={s.confirmation}>
          <strong>确认后台处理</strong>
          <p>任务：{intent.taskId}</p>
          <p>
            操作：{intent.action} · {intent.providerTaskId}
          </p>
          <p>依据：{intent.reason}</p>
          <code className={s.identifier}>{intent.requestId}</code>
          <button type="button" className={s.primary} disabled={busy} onClick={send}>
            {busy ? "正在提交…" : "确认处理 / 重试同一操作"}
          </button>
        </div>
      ) : (
        <form
          className={s.actionForm}
          onSubmit={(e) => {
            e.preventDefault();
            setIntent({
              requestId: crypto.randomUUID(),
              taskId,
              action,
              reason: reason.trim(),
              ...(action === "LINK_TASK" ? { providerTaskId: external.trim() } : {}),
              ...(action === "CONFIRM_FAILURE" ? { acknowledgeNoResult: ack } : {}),
            });
          }}
        >
            <div>
              <label htmlFor="video-review-action">处理方式</label>
              <select id="video-review-action" className={s.smallButton} value={action} onChange={(e) => setAction(e.target.value)}>
              {hasResult ? (
                <option value="RETRY_STORAGE">仅重试保存已成功视频</option>
              ) : (
                <>
                  <option value="LINK_TASK">关联已核实的 Kie 任务，继续查询</option>
                  <option value="CONFIRM_FAILURE">已核实没有结果，释放积分</option>
                </>
              )}
            </select>
          </div>
          {action === "LINK_TASK" && (
            <label>
              Kie 任务编号
              <input
                required
                maxLength={200}
                value={external}
                onChange={(e) => setExternal(e.target.value)}
              />
            </label>
          )}
          <label>
            核实依据（12–300 字）
            <textarea
              required
              minLength={12}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {action === "CONFIRM_FAILURE" && (
            <label>
              <input
                type="checkbox"
                required
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              我已确认供应商没有可交付结果，本操作会释放冻结积分。
            </label>
          )}
          <button type="submit" className={s.primary}>
            核对操作
          </button>
        </form>
      )}
      {message && (
        <p className={s.notice} aria-live="polite">
          {message}
        </p>
      )}
    </div>
  );
}
