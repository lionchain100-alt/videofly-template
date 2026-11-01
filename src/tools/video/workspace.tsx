"use client";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Video, Download } from "lucide-react";
import { useCreditsStore } from "@/stores/credits-store";
import type { LiveVideoTask, VideoInput } from "./contract";
import s from "@/ui-presets/site.module.css";
import extra from "@/tools/text-summary/workspace.module.css";
type Intent = { requestId: string; input: VideoInput };
export function VideoWorkspace({
  locale,
  prompt,
  setPrompt,
  aspect,
  setAspect,
  arrangement,
}: {
  locale: "zh" | "en";
  prompt: string;
  setPrompt: (v: string) => void;
  aspect: string;
  setAspect: (v: string) => void;
  arrangement: "split" | "stacked";
}) {
  const t = (zh: string, en: string) => (locale === "zh" ? zh : en);
  const [config, setConfig] = useState<{
    enabled: boolean;
    credits: number | null;
    model: string;
    duration: number;
    resolution: string;
  } | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [task, setTask] = useState<LiveVideoTask | null>(null);
  const [history, setHistory] = useState<LiveVideoTask[]>([]);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const sending = useRef(false);
  const active =
    task && !["SUCCEEDED", "FAILED"].includes(task.status) && task.stage !== "RECONCILING";
  const root = "/api/v1/tools/video";
  function credits() {
    useCreditsStore.getState().invalidate();
    void useCreditsStore.getState().fetchBalance();
  }
  async function json(r: Response) {
    const body = await r.json();
    if (!r.ok) throw Error(body.error?.message || "Request failed");
    return body.data;
  }
  useEffect(() => {
    let stopped = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const [settings, response] = await Promise.all([
          fetch(root, { cache: "no-store", signal: controller.signal }).then(json),
          fetch(`${root}/tasks`, { cache: "no-store", signal: controller.signal }),
        ]);
        if (stopped) return;
        setConfig(settings);
        if (response.ok) {
          const data = await json(response);
          if (stopped) return;
          setUserId(data.userId);
          setHistory(data.tasks);
          if (data.tasks[0]) {
            setTask(data.tasks[0]);
            if (!prompt) setPrompt(data.tasks[0].input.prompt);
            setAspect(data.tasks[0].input.aspectRatio);
          }
          try {
            const draft = JSON.parse(
              sessionStorage.getItem(`video-pending-${data.userId}`) || "null",
            );
            if (draft?.requestId && draft.input) {
              setIntent(draft);
              setMessage(
                t(
                  "上次提交尚未确认，请重试同一请求。",
                  "Previous submission is unconfirmed. Retry the same request.",
                ),
              );
            }
          } catch {}
        } else if (response.status !== 401) throw Error();
      } catch {
        if (!stopped)
          setMessage(t("连接暂不可用，请刷新。", "Connection unavailable. Refresh to retry."));
      } finally {
        if (!stopped) setReady(true);
      }
    })();
    return () => {
      stopped = true;
      controller.abort();
    };
  }, []);
  useEffect(() => {
    if (!task || !active) return;
    const id = task.id;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      try {
        const r = await fetch(`${root}/tasks/${id}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (r.status === 401) {
          if (!stopped)
            setMessage(t("会话已失效，请重新登录查看。", "Session expired. Sign in again."));
          return;
        }
        const updated = (await json(r)) as LiveVideoTask;
        if (stopped) return;
        setTask(updated);
        setHistory((items) => [updated, ...items.filter((v) => v.id !== id)].slice(0, 20));
        if (["SUCCEEDED", "FAILED"].includes(updated.status) || updated.stage === "RECONCILING") {
          credits();
          return;
        }
      } catch {
        if (!stopped)
          setMessage(
            t(
              "连接中断，任务仍在后台执行；正在重连。",
              "Connection interrupted; your saved task continues. Reconnecting.",
            ),
          );
      }
      if (!stopped) timer = setTimeout(poll, 2500);
    }
    timer = setTimeout(poll, 700);
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [task?.id, active]);
  async function submit() {
    if (sending.current) return;
    if (!userId) {
      window.location.assign(locale === "zh" ? "/zh/login" : "/login");
      return;
    }
    if (!intent && (!config?.enabled || prompt.trim().length < 10 || prompt.length > 1500)) {
      setMessage(
        t(
          "请输入 10–1500 字提示词，并确认视频已启用。",
          "Enter 10–1500 characters and ensure video is enabled.",
        ),
      );
      return;
    }
    const payload =
      intent ||
      ({
        requestId: crypto.randomUUID(),
        input: { prompt: prompt.trim(), aspectRatio: aspect === "9:16" ? "9:16" : "16:9" },
      } satisfies Intent);
    try {
      sessionStorage.setItem(`video-pending-${userId}`, JSON.stringify(payload));
    } catch {
      setMessage(t("请允许会话存储后提交。", "Enable session storage before submitting."));
      return;
    }
    sending.current = true;
    setBusy(true);
    setIntent(payload);
    setMessage("");
    try {
      const response = await fetch(root, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        if ([400, 401, 402, 403, 413, 429, 503].includes(response.status)) {
          sessionStorage.removeItem(`video-pending-${userId}`);
          setIntent(null);
        }
        setMessage(body.error?.message || t("提交未确认。", "Submission unconfirmed."));
        return;
      }
      const created = (await fetch(`${root}/tasks/${body.data.id}`, { cache: "no-store" }).then(
        json,
      )) as LiveVideoTask;
      setTask(created);
      setHistory((items) => [created, ...items.filter((v) => v.id !== created.id)].slice(0, 20));
      sessionStorage.removeItem(`video-pending-${userId}`);
      setIntent(null);
      credits();
    } catch {
      setMessage(
        t(
          "响应中断，请重试同一提交，不会重复创建或冻结积分。",
          "Response interrupted. Retry the same submission; no duplicate task or credit hold.",
        ),
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  function label(v: LiveVideoTask) {
    if (v.stage === "RECONCILING")
      return t("待核实 · 积分保留冻结", "Needs review · credits remain held");
    if (v.status === "SUCCEEDED") return t("视频已完成", "Video ready");
    if (v.status === "FAILED") return t("失败 · 积分已释放", "Failed · credits released");
    return (
      {
        QUEUED: t("排队中", "Queued"),
        SUBMITTING: t("正在提交", "Submitting"),
        POLLING: t("视频生成中", "Generating video"),
        STORING: t("正在保存视频", "Saving video"),
      }[v.stage] || v.status
    );
  }
  return (
    <section
      className={`${s.workspace} ${arrangement === "stacked" ? s.stacked : ""}`}
      aria-label={t("真实视频工作区", "Live video workspace")}
    >
      <div className={s.inputPanel}>
        <div className={s.panelHeading}>
          <span>
            <Video size={17} />
            {t("文生视频", "Text to video")}
          </span>
          <span className={extra.badge}>Kie · Wan 2.7</span>
        </div>
        <label className={s.srOnly} htmlFor="live-video-prompt">
          {t("视频提示词", "Video prompt")}
        </label>
        <textarea
          id="live-video-prompt"
          maxLength={1500}
          disabled={busy || !!intent}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t(
            "描述场景、动作、光线和镜头（10–1500 字）",
            "Describe a scene, motion, lighting and camera (10–1500 characters)",
          )}
        />
        <div className={s.inputFooter}>
          <span>{prompt.length} / 1,500</span>
          <button
            type="button"
            disabled={busy || !!intent}
            onClick={() =>
              setPrompt(
                "A single red paper boat floats slowly across a shallow puddle in a quiet garden. Soft morning light, gentle ripples, fixed camera, continuous shot. No people, text, logos, narration or music.",
              )
            }
          >
            {t("填入测试提示词", "Use test prompt")}
          </button>
        </div>
        <div className={s.actionRow}>
          <label className={s.parameter} htmlFor="live-video-aspect">
            {t("画面比例", "Aspect ratio")}
          </label>
          <select
            className={extra.select}
            id="live-video-aspect"
            value={aspect}
            disabled={busy || !!intent}
            onChange={(e) => setAspect(e.target.value)}
          >
            <option>16:9</option>
            <option>9:16</option>
          </select>
          <button
            type="button"
            className={s.primary}
            disabled={!ready || busy || (!intent && !!userId && !config?.enabled)}
            onClick={submit}
          >
            {busy && <LoaderCircle className={s.spin} size={15} />}{" "}
            {intent
              ? t("重试同一提交", "Retry same submission")
              : userId
                ? t("生成视频", "Generate video")
                : t("登录后生成视频", "Sign in to generate")}
          </button>
        </div>
        <p className={s.demoHint}>
          {config?.enabled
            ? t(
                `5 秒 · 1080p · 每次 ${config.credits} 积分。提交冻结，可播放结果保存后结算，明确失败释放。`,
                `5 seconds · 1080p · ${config.credits} credits. Held on submission, settled after the file is saved, released on confirmed failure.`,
              )
            : t(
                "视频尚未启用，当前不会提交或冻结积分。",
                "Video is not enabled; no submission or credit hold.",
              )}
        </p>
        <p className={extra.note}>
          {t(
            "测试会调用 Kie 并产生供应商费用；请先检查提示词。刷新或关闭页面不影响后台执行。",
            "This calls Kie and incurs provider usage. Review your prompt first. Saved jobs continue after refresh or closing the page.",
          )}
        </p>
        {intent && <p className={extra.identifier}>{intent.requestId}</p>}
        {message && <output className={extra.note}>{message}</output>}
        <div className={extra.history}>
          <h3>{t("最近视频任务", "Recent video tasks")}</h3>
          {history.length ? (
            history.map((v) => (
              <button
                type="button"
                key={v.id}
                onClick={() => {
                  setTask(v);
                  setPrompt(v.input.prompt);
                  setAspect(v.input.aspectRatio);
                }}
              >
                <span>{v.input.prompt.slice(0, 38)}</span>
                <small>{label(v)}</small>
              </button>
            ))
          ) : (
            <p>
              {t("登录后查看最近 20 条视频任务。", "Sign in to view your last 20 video tasks.")}
            </p>
          )}
        </div>
      </div>
      <div className={s.resultPanel} aria-live="polite">
        {task ? (
          <div className={s.resultContent}>
            <div className={s.resultHeading}>
              <span>
                {active && <LoaderCircle className={s.spin} size={15} />} {label(task)}
              </span>
              {task.videoUrl && (
                <a
                  href={`${task.videoUrl}?download=1`}
                  aria-label={t("下载视频", "Download video")}
                >
                  <Download size={18} />
                </a>
              )}
            </div>
            <p className={extra.identifier}>
              {t("任务：", "Task: ")}
              {task.id}
            </p>
            {task.videoUrl ? (
              <video
                controls
                playsInline
                preload="metadata"
                style={{ width: "100%", maxHeight: 440, borderRadius: 8 }}
                src={task.videoUrl}
                aria-label={t("生成的视频", "Generated video")}
              />
            ) : (
              <div className={s.empty}>
                <Video size={30} />
                <p>
                  {task.errorMessage ||
                    task.lastError ||
                    t(
                      "任务已保存，视频可能需要数分钟生成。",
                      "Task saved. Generation may take several minutes.",
                    )}
                </p>
              </div>
            )}
            <p className={s.resultNote}>
              {task.creditStatus === "SETTLED"
                ? t(`已结算 ${task.credits} 积分`, `Settled ${task.credits} credits`)
                : task.creditStatus === "RELEASED"
                  ? t(
                      "积分已退回原积分包，保留原有效期。",
                      "Credits returned to original packages with original expiry.",
                    )
                  : t(`冻结 ${task.credits} 积分`, `Holding ${task.credits} credits`)}
            </p>
            {task.errorCode && <p className={extra.identifier}>{task.errorCode}</p>}
          </div>
        ) : (
          <div className={s.empty}>
            <Video size={32} />
            <h3>{t("让画面开始流动", "Bring your scene to life")}</h3>
            <p>
              {t(
                "先用一个短片验证完整流程。",
                "Start with a short clip to verify the full workflow.",
              )}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
