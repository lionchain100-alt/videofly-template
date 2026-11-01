"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useCreditsStore } from "@/stores/credits-store";
import styles from "./management.module.css";

interface Target {
  id: string;
  email: string;
  name: string | null;
  disabled: boolean;
  isAdmin: boolean;
  available: number;
}
interface Intent {
  kind: "grant" | "status";
  requestId: string;
  userId: string;
  credits?: number;
  expiryDays?: number;
  remark?: string;
  disabled?: boolean;
  reason?: string;
}
export function UserActions({ user, locale }: { user: Target; locale: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const storageKey = `laconic-admin-pending-${user.id}`;
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"grant" | "status">("grant");
  const [stage, setStage] = useState<"edit" | "confirm" | "success">("edit");
  const [credits, setCredits] = useState("100");
  const [days, setDays] = useState("365");
  const [reason, setReason] = useState("");
  const [intent, setIntent] = useState<Intent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [result, setResult] = useState<{
    requestId: string;
    balanceAfter: number | null;
    replayed: boolean;
  } | null>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  function show(nextKind: "grant" | "status") {
    setKind(nextKind);
    setStage("edit");
    setCredits("100");
    setDays("365");
    setReason("");
    setError("");
    setIntent(null);
    setResult(null);
    setUncertain(false);
    try {
      const stored = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      if (
        stored?.userId === user.id &&
        typeof stored.requestId === "string" &&
        ["grant", "status"].includes(stored.kind)
      ) {
        setIntent(stored);
        setKind(stored.kind);
        setStage("confirm");
        setUncertain(true);
        setError("上次操作尚未确认，请用原请求编号重试；不会重复执行。");
      }
    } catch {
      setError("无法读取会话草稿，请先确认浏览器允许会话存储。");
    }
    setOpen(true);
  }
  function close() {
    if (busy) return;
    dialog.current?.close();
    setOpen(false);
  }
  function review(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (reason.trim().length < 3 || reason.trim().length > 300) {
      setError("原因需要 3–300 个字符。");
      return;
    }
    if (
      kind === "grant" &&
      (!Number.isInteger(Number(credits)) ||
        Number(credits) < 1 ||
        Number(credits) > 100000 ||
        !Number.isInteger(Number(days)) ||
        Number(days) < 1 ||
        Number(days) > 3650)
    ) {
      setError("积分与有效期必须是允许范围内的正整数。");
      return;
    }
    setIntent({
      kind,
      requestId: crypto.randomUUID(),
      userId: user.id,
      ...(kind === "grant"
        ? { credits: Number(credits), expiryDays: Number(days), remark: reason.trim() }
        : { disabled: !user.disabled, reason: reason.trim() }),
    });
    setStage("confirm");
  }
  async function send() {
    if (!intent || busy) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(intent));
    } catch {
      setError("无法暂存请求编号，请允许会话存储后再提交。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { kind: operationKind, ...payload } = intent;
      const response = await fetch(
        operationKind === "grant" ? "/api/v1/admin/credits/add" : "/api/v1/admin/users/status",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        const code = body.error?.details?.code;
        if (
          response.status === 400 ||
          response.status === 404 ||
          ["USER_DISABLED", "PROTECTED_ADMIN"].includes(code)
        ) {
          sessionStorage.removeItem(storageKey);
          setStage("edit");
          setUncertain(false);
        } else setUncertain(true);
        setError(body.error?.message || "操作未确认，请使用同一请求编号重试。");
        return;
      }
      setResult(body.data);
      setStage("success");
      setUncertain(false);
      sessionStorage.removeItem(storageKey);
      router.refresh();
      useCreditsStore.getState().invalidate();
      void useCreditsStore.getState().fetchBalance();
    } catch {
      setUncertain(true);
      setError("网络中断，结果尚未确认。请重试同一操作，或按请求编号查看记录；不要另建一笔。");
    } finally {
      setBusy(false);
    }
  }
  const title =
    kind === "grant"
      ? "手动发积分"
      : (intent?.disabled ?? !user.disabled)
        ? "停用账号"
        : "恢复账号";
  const adminRoot = `${locale === "en" ? "" : `/${locale}`}/admin`;
  return (
    <>
      <div className={styles.rowActions}>
        <button
          type="button"
          className={styles.smallButton}
          disabled={user.disabled}
          onClick={() => show("grant")}
        >
          发积分
        </button>
        {!user.isAdmin && (
          <button type="button" className={styles.textButton} onClick={() => show("status")}>
            {user.disabled ? "恢复" : "停用"}
          </button>
        )}
      </div>
      {open && (
        <dialog
          ref={dialog}
          className={styles.dialog}
          aria-labelledby={`dialog-${user.id}`}
          onCancel={(event) => {
            if (busy) event.preventDefault();
            else close();
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div className={styles.dialogContent}>
            <button
              type="button"
              className={styles.close}
              aria-label="关闭操作窗口"
              disabled={busy}
              onClick={close}
            >
              ×
            </button>
            <h2 id={`dialog-${user.id}`}>{title}</h2>
            <p className={styles.muted}>
              {user.name || "未设置姓名"} · {user.email}
            </p>
            {stage === "edit" ? (
              <form onSubmit={review} className={styles.actionForm}>
                {kind === "grant" && (
                  <>
                    <label>
                      发放积分
                      <input
                        type="number"
                        min="1"
                        max="100000"
                        step="1"
                        required
                        value={credits}
                        onChange={(event) => setCredits(event.target.value)}
                      />
                    </label>
                    <label>
                      有效期（天）
                      <input
                        type="number"
                        min="1"
                        max="3650"
                        step="1"
                        required
                        value={days}
                        onChange={(event) => setDays(event.target.value)}
                      />
                    </label>
                    <p className={styles.muted}>
                      当前可用 {user.available} 积分。有效期从实际到账时起计算。
                    </p>
                  </>
                )}
                <label>
                  操作原因
                  <textarea
                    required
                    minLength={3}
                    maxLength={300}
                    rows={3}
                    value={reason}
                    placeholder="例如：客服补偿、测试额度、账号异常处理"
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
                {error && (
                  <p role="alert" className={styles.error}>
                    {error}
                  </p>
                )}
                <div className={styles.dialogFooter}>
                  <button type="button" className={styles.smallButton} onClick={close}>
                    取消
                  </button>
                  <button type="submit" className={styles.primary}>
                    核对操作
                  </button>
                </div>
              </form>
            ) : stage === "confirm" && intent ? (
              <>
                <div className={styles.confirmation}>
                  <strong>请核对本次操作</strong>
                  <dl>
                    <dt>目标账号</dt>
                    <dd>{user.email}</dd>
                    {kind === "grant" ? (
                      <>
                        <dt>发放额度</dt>
                        <dd>+{intent.credits} 积分</dd>
                        <dt>有效期</dt>
                        <dd>{intent.expiryDays} 天</dd>
                      </>
                    ) : (
                      <>
                        <dt>账号状态</dt>
                        <dd>{intent.disabled ? "停用并撤销现有会话" : "恢复登录和使用"}</dd>
                      </>
                    )}
                    <dt>原因</dt>
                    <dd>{intent.remark || intent.reason}</dd>
                  </dl>
                </div>
                <p className={styles.muted}>
                  操作将写入审计记录。
                  {kind === "grant" ? "同一请求编号只到账一次。" : "管理员账号不允许在此入口停用。"}
                </p>
                <code className={styles.identifier}>{intent.requestId}</code>
                {error && (
                  <p role="alert" className={styles.error}>
                    {error}
                  </p>
                )}
                <div className={styles.dialogFooter}>
                  {!uncertain && (
                    <button
                      type="button"
                      className={styles.smallButton}
                      disabled={busy}
                      onClick={() => setStage("edit")}
                    >
                      返回修改
                    </button>
                  )}
                  <button type="button" className={styles.primary} disabled={busy} onClick={send}>
                    {busy
                      ? "正在提交…"
                      : uncertain
                        ? "重试同一操作"
                        : kind === "grant"
                          ? `确认发放 ${intent.credits} 积分`
                          : "确认修改状态"}
                  </button>
                </div>
              </>
            ) : (
              <div className={styles.success} aria-live="polite">
                <strong>{result?.replayed ? "该操作已处理，未重复执行" : "操作已完成"}</strong>
                {kind === "grant" && <p>到账后可用余额：{result?.balanceAfter} 积分</p>}
                <p className={styles.muted}>页面数据已刷新，历史记录可追溯。</p>
                <code className={styles.identifier}>{result?.requestId}</code>
                <div className={styles.dialogFooter}>
                  {kind === "grant" && (
                    <a href={`${adminRoot}/credits?q=${result?.requestId}`}>查看本次流水 →</a>
                  )}
                  <button type="button" className={styles.primary} onClick={close}>
                    完成
                  </button>
                </div>
              </div>
            )}
          </div>
        </dialog>
      )}
    </>
  );
}
