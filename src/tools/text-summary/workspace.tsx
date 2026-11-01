"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Copy, Download, FileText, LoaderCircle } from "lucide-react";
import type { SummaryTask, SummaryInput } from "./contract";
import { useCreditsStore } from "@/stores/credits-store";
import styles from "@/ui-presets/site.module.css";
import extra from "./workspace.module.css";

interface Intent {
  requestId: string;
  input: SummaryInput;
}
export function SummaryWorkspace({
  locale,
  text,
  setText,
  length,
  setLength,
  arrangement,
  submitLabel,
}: {
  locale: "zh" | "en";
  text: string;
  setText: (text: string) => void;
  length: string;
  setLength: (length: string) => void;
  arrangement: "split" | "stacked";
  submitLabel: string;
}) {
  const en = locale === "en";
  const t = (zh: string, english: string) => (en ? english : zh);
  const [config, setConfig] = useState<{ enabled: boolean; credits: number | null } | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [history, setHistory] = useState<SummaryTask[]>([]);
  const [task, setTask] = useState<SummaryTask | null>(null);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [connection, setConnection] = useState("");
  const sending = useRef(false);
  const loaded = useRef(false);
  const active = task?.status === "QUEUED" || task?.status === "RUNNING";
  function refreshCredits() {
    useCreditsStore.getState().invalidate();
    void useCreditsStore.getState().fetchBalance();
  }
  async function readJson(response: Response) {
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message || "Request failed");
    return body.data;
  }
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const [settings, response] = await Promise.all([
          fetch("/api/v1/tools/text-summary", {
            signal: controller.signal,
            cache: "no-store",
          }).then(readJson),
          fetch("/api/v1/tasks", { signal: controller.signal, cache: "no-store" }),
        ]);
        if (controller.signal.aborted) return;
        setConfig(settings);
        if (response.ok) {
          const data = await readJson(response);
          if (controller.signal.aborted) return;
          setUserId(data.userId);
          setHistory(data.tasks);
          if (!loaded.current) {
            loaded.current = true;
            const latest = data.tasks[0];
            if (latest) {
              setTask(latest);
              if (!text) setText(latest.input.text);
              setLength(latest.input.length);
            }
            try {
              const saved = JSON.parse(
                sessionStorage.getItem(`summary-pending-${data.userId}`) || "null",
              );
              if (saved?.requestId && saved.input) {
                setIntent(saved);
                setError(
                  t(
                    "上次提交尚未确认，请重试同一请求。",
                    "Previous submission is unconfirmed. Retry the same request.",
                  ),
                );
              }
            } catch {}
          }
        } else if (response.status !== 401) throw new Error("Task history unavailable");
      } catch {
        if (!controller.signal.aborted)
          setConnection(t("服务连接失败，请刷新重试。", "Unable to connect. Refresh to retry."));
      } finally {
        if (!controller.signal.aborted) setReady(true);
      }
    })();
    return () => controller.abort();
    // Initialize once per mount; draft input edits must not refetch task history.
  }, []);
  useEffect(() => {
    if (!task || !active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    async function poll() {
      try {
        const response = await fetch(`/api/v1/tasks/${task!.id}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 401) {
          setConnection(
            t(
              "会话已失效，请重新登录后查看任务。",
              "Session expired. Sign in again to view your task.",
            ),
          );
          return;
        }
        const updated = (await readJson(response)) as SummaryTask;
        if (stopped) return;
        setTask(updated);
        setConnection("");
        setHistory((items) => [updated, ...items.filter((v) => v.id !== updated.id)].slice(0, 20));
        if (updated.status === "SUCCEEDED" || updated.status === "FAILED") {
          refreshCredits();
          return;
        }
      } catch {
        if (!stopped)
          setConnection(
            t(
              "连接中断，任务仍在服务端保存；正在重新连接。",
              "Connection interrupted. Your task is saved; reconnecting.",
            ),
          );
      }
      if (!stopped) timer = setTimeout(poll, 1800);
    }
    timer = setTimeout(poll, 500);
    return () => {
      stopped = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [task?.id, active]);
  async function submit() {
    if (sending.current) return;
    if (!userId) {
      window.location.assign(en ? "/login" : "/zh/login");
      return;
    }
    if (!intent && (!config?.enabled || text.trim().length < 20 || text.length > 8000)) {
      setError(
        t(
          "请输入 20–8000 字原文，并确认模型已启用。",
          "Enter 20–8000 characters and ensure the model is enabled.",
        ),
      );
      return;
    }
    const next =
      intent ||
      ({
        requestId: crypto.randomUUID(),
        input: {
          text: text.trim(),
          length: length === "long" ? "long" : "short",
          language: locale,
        },
      } satisfies Intent);
    try {
      sessionStorage.setItem(`summary-pending-${userId}`, JSON.stringify(next));
    } catch {
      setError(
        t(
          "请允许浏览器会话存储，以便安全恢复提交。",
          "Enable session storage to safely recover submissions.",
        ),
      );
      return;
    }
    sending.current = true;
    setPending(true);
    setIntent(next);
    setError("");
    try {
      const response = await fetch("/api/v1/tools/text-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const body = await response.json();
      if (!response.ok) {
        if ([400, 401, 402, 403, 413, 429, 503].includes(response.status)) {
          sessionStorage.removeItem(`summary-pending-${userId}`);
          setIntent(null);
        }
        setError(
          body.error?.message ||
            t("提交未确认，请重试同一请求。", "Submission unconfirmed. Retry the same request."),
        );
        return;
      }
      // Resolve the receipt before clearing the persisted request, so a GET failure remains safely retryable.
      const created = (await fetch(`/api/v1/tasks/${body.data.id}`, { cache: "no-store" }).then(
        readJson,
      )) as SummaryTask;
      setTask(created);
      setHistory((items) => [created, ...items.filter((v) => v.id !== created.id)].slice(0, 20));
      sessionStorage.removeItem(`summary-pending-${userId}`);
      setIntent(null);
      refreshCredits();
    } catch {
      setError(
        t(
          "网络中断，提交结果未确认。请重试同一请求，不会重复冻结积分。",
          "Connection lost. Retry the same request; credits will not be held twice.",
        ),
      );
    } finally {
      sending.current = false;
      setPending(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(task?.result || "");
      setError(t("结果已复制。", "Result copied."));
    } catch {
      setError(t("请选中结果后手动复制。", "Select the result and copy manually."));
    }
  }
  function download() {
    if (!task?.result) return;
    const url = URL.createObjectURL(new Blob([task.result], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `summary-${task.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const labels: Record<string, string> = {
    QUEUED: t("排队中", "Queued"),
    RUNNING: t("正在生成摘要", "Generating summary"),
    SUCCEEDED: t("摘要已完成", "Summary complete"),
    FAILED: t("摘要失败 · 积分已释放", "Failed · credits released"),
  };
  return (
    <section
      className={`${styles.workspace} ${arrangement === "stacked" ? styles.stacked : ""}`}
      aria-label={t("真实文本摘要工作区", "Live text summary workspace")}
    >
      <div className={styles.inputPanel}>
        <div className={styles.panelHeading}>
          <span>
            <FileText size={17} />
            {t("文本摘要", "Text summary")}
          </span>
          <span className={extra.badge}>{t("真实任务", "Live task")}</span>
        </div>
        <label className={styles.srOnly} htmlFor="live-summary-input">
          {t("摘要原文", "Source text")}
        </label>
        <textarea
          id="live-summary-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={8000}
          disabled={pending || !!intent}
          placeholder={t(
            "粘贴文章、会议记录等原文（20–8000 字）",
            "Paste an article or meeting notes (20–8000 characters)",
          )}
        />
        <div className={styles.inputFooter}>
          <span>{text.length} / 8,000</span>
          <button
            type="button"
            disabled={pending || !!intent}
            onClick={() =>
              setText(
                t(
                  "本周项目会议确认，首版将先上线文本摘要工具，使用统一的用户、任务和积分服务。团队决定优先验证提交、成功扣费和失败退回流程，然后再接入视频模型和支付通道。真实模型供应商将在摘要质量、速度与成本评估后确定。",
                  "The project team agreed to launch text summaries first, sharing accounts, tasks and credits. The first milestone covers submission, successful settlement and credit release on failure. Video and payments follow after validation. The model provider will be chosen after evaluating quality, latency and cost.",
                ),
              )
            }
          >
            {t("填入示例原文", "Use sample source")} <ArrowRight size={12} />
          </button>
        </div>
        <div className={styles.actionRow}>
          <label className={styles.parameter} htmlFor="live-summary-length">
            {t("摘要长度", "Length")}
          </label>
          <select
            id="live-summary-length"
            className={extra.select}
            disabled={pending || !!intent}
            value={length}
            onChange={(e) => setLength(e.target.value)}
          >
            <option value="short">{t("简洁", "Short")}</option>
            <option value="long">{t("详细", "Detailed")}</option>
          </select>
          <button
            type="button"
            className={styles.primary}
            onClick={submit}
            disabled={!ready || pending || (!intent && !!userId && !config?.enabled)}
          >
            {pending ? <LoaderCircle size={16} className={styles.spin} /> : null}
            {intent
              ? t("重试同一提交", "Retry same request")
              : !userId
                ? t("登录后生成摘要", "Sign in to summarize")
                : submitLabel}
          </button>
        </div>
        <p className={styles.demoHint}>
          {config?.enabled
            ? t(
                `每次 ${config.credits} 积分 · 提交冻结，成功结算，失败释放。`,
                `Costs ${config.credits} credits. Held on submission, settled on success, released on failure.`,
              )
            : t(
                "模型尚未配置，当前不可执行，不扣积分。",
                "Model not configured. Execution is disabled; no credits used.",
              )}
        </p>
        {intent && (
          <p className={extra.note}>
            {t("待确认请求：", "Pending request: ")}
            <code>{intent.requestId}</code>
          </p>
        )}
        {error && <output className={extra.note}>{error}</output>}
        {connection && <output className={extra.note}>{connection}</output>}
        <p className={extra.note}>
          {t(
            "提交后原文会发送给配置的模型供应商，并在本站保存任务与结果。",
            "Your source is sent to the configured model provider. This site saves the task and result.",
          )}
        </p>
        <div className={extra.history}>
          <h3>{t("最近任务", "Recent tasks")}</h3>
          {history.length ? (
            history.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTask(item);
                  setText(item.input.text);
                  setLength(item.input.length);
                }}
              >
                <span>{item.input.text.slice(0, 35)}</span>
                <small>{labels[item.status]}</small>
              </button>
            ))
          ) : (
            <p>{t("登录后查看最近 20 条真实任务。", "Sign in to view your last 20 tasks.")}</p>
          )}
        </div>
      </div>
      <div className={styles.resultPanel} aria-live="polite">
        {task ? (
          <div className={styles.resultContent}>
            <div className={styles.resultHeading}>
              <span>
                {active ? (
                  <LoaderCircle size={16} className={styles.spin} />
                ) : task.status === "SUCCEEDED" ? (
                  <Check size={16} />
                ) : null}
                {labels[task.status]}
              </span>
              {task.result && (
                <div>
                  <button type="button" aria-label={t("复制摘要", "Copy summary")} onClick={copy}>
                    <Copy size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label={t("下载摘要", "Download summary")}
                    onClick={download}
                  >
                    <Download size={16} />
                  </button>
                </div>
              )}
            </div>
            <p className={extra.identifier}>
              {t("任务：", "Task: ")}
              {task.id}
            </p>
            {task.result ? (
              <p className={styles.summaryText}>{task.result}</p>
            ) : (
              <div className={styles.empty}>
                <p>
                  {task.errorMessage ||
                    t(
                      "任务已持久化，刷新或关闭页面不影响执行。",
                      "Your task is saved and continues if you close or refresh this page.",
                    )}
                </p>
              </div>
            )}
            <p className={styles.resultNote}>
              {task.creditStatus === "HOLDING"
                ? t(`冻结 ${task.credits} 积分`, `Holding ${task.credits} credits`)
                : task.creditStatus === "SETTLED"
                  ? t(`已结算 ${task.credits} 积分`, `Settled ${task.credits} credits`)
                  : task.creditStatus === "RELEASED"
                    ? t(
                        "积分已释放至原积分包，保留原有效期。",
                        "Credits released to their original packages, with original expiry.",
                      )
                    : ""}
            </p>
            {task.errorCode && <p className={extra.identifier}>{task.errorCode}</p>}
          </div>
        ) : (
          <div className={styles.empty}>
            <FileText size={32} />
            <h3>{t("让长文变得清晰", "Make long reads clear")}</h3>
            <p>
              {t(
                "输入原文，生成可保存、可追溯的真实摘要。",
                "Generate a real summary with a saved task record.",
              )}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
