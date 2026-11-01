"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

export function LocalAdminLogin({ locale }: { locale: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await authClient.signIn.email({ email: email.trim().toLowerCase(), password });
      if (result.error) { setError("邮箱或密码不正确，请检查本地测试账号。" ); return; }
      router.push(locale === "zh" ? "/zh/admin" : "/admin"); router.refresh();
    } catch { setError("登录失败，请确认本地数据库已启动后重试。" ); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="grid gap-4" aria-label="本地测试账号登录">
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">本地测试登录<br/><span className="text-xs">使用已初始化的测试账号，无需 Google 或邮件服务。</span></div>
    <label className="grid gap-2 text-sm font-medium" htmlFor="local-email">邮箱<input id="local-email" type="email" autoComplete="username" value={email} required onChange={e => setEmail(e.target.value)} className="h-11 w-full rounded-md border bg-background px-3 font-normal"/></label>
    <label className="grid gap-2 text-sm font-medium" htmlFor="local-password">密码<input id="local-password" type="password" autoComplete="current-password" value={password} required onChange={e => setPassword(e.target.value)} className="h-11 w-full rounded-md border bg-background px-3 font-normal"/></label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <button type="submit" disabled={busy} className="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy ? "正在登录…" : "登录管理后台"}</button>
    <p className="text-xs leading-6 text-muted-foreground">测试账号保存在独立的本地数据库。此密码登录仅在本机开发模式开启，公开注册已关闭。</p>
  </form>;
}
