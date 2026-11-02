import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { siteManifest } from "@/config/site-manifest";
import { readSiteManifest } from "@/config/site-server";
import { ApiError } from "@/lib/api/error";
import { snapshotHash } from "@/ai/text-provider";
import {
  policySchema,
  initialPolicy,
  changePolicySchema,
  costReviewSchema,
  acceptedCapabilities,
  type AiPolicy,
  type AiProfile,
} from "@/ai/governance-contract";
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = Tx | typeof db;
const site = siteManifest.id;
export async function bootstrapAiPolicy() {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(700007)`);
    const present = await tx.execute(
      sql`select site_id from ai_policy_current where site_id=${site}`,
    );
    if (present.length) return;
    const id = randomUUID(),
      config = initialPolicy();
    await tx.execute(
      sql`insert into ai_policy_versions(id,site_id,revision,config,reason,request_id,request_hash,origin)values(${id},${site},1,${JSON.stringify(config)}::jsonb,'AUD-007 local defaults; Owner approved 5/min,50/day,USD10/day,USD100/month',${randomUUID()},${snapshotHash(config)},'BOOTSTRAP')`,
    );
    await tx.execute(
      sql`insert into ai_policy_current(site_id,version_id)values(${site},${id})`,
    );
  });
}
export async function currentAiPolicy(ex: Executor = db, lock = false) {
  const rows = await ex.execute(
    sql`select v.id,v.revision,v.config from ai_policy_current c join ai_policy_versions v on v.id=c.version_id where c.site_id=${site} ${lock ? sql`for update of c` : sql``}`,
  );
  if (!rows.length) throw new ApiError("模型策略尚未初始化，请联系管理员", 503);
  return {
    id: String(rows[0].id),
    revision: Number(rows[0].revision),
    config: policySchema.parse(rows[0].config),
  };
}
async function admin(tx: Tx, id: string) {
  const rows = await tx.execute(
    sql`select id from "user" where id=${id} and "isAdmin"=true and "emailVerified"=true and coalesce(disabled,false)=false for update`,
  );
  if (!rows.length) throw new ApiError("仅有效管理员可以操作", 403);
}
export async function saveAiPolicy(actorId: string, body: unknown) {
  const command = changePolicySchema.parse(body),
    fingerprint = snapshotHash(command);
  return db.transaction(async (tx) => {
    await admin(tx, actorId);
    const current = await currentAiPolicy(tx, true);
    const old = await tx.execute(
      sql`select id,revision,request_hash,actor_id from ai_policy_versions where request_id=${command.requestId}`,
    );
    if (old.length) {
      if (old[0].request_hash !== fingerprint || old[0].actor_id !== actorId)
        throw new ApiError("请求编号已用于不同配置", 409);
      return {
        id: String(old[0].id),
        revision: Number(old[0].revision),
        replayed: true,
      };
    }
    if (current.revision !== command.expectedRevision)
      throw new ApiError("配置已更新，请重新载入后再保存", 409);
    const allowed = new Set(
      [
        process.env.TEXT_AI_MODEL,
        ...(process.env.TEXT_AI_ALLOWED_MODELS || "")
          .split(",")
          .map((x) => x.trim()),
      ].filter(Boolean),
    );
    for (const p of command.config.profiles) {
      const previous = current.config.profiles.find((x) => x.id === p.id);
      if (
        p.toolId === "video-generation" &&
        p.model !== "wan/2-7-text-to-video"
      )
        throw new ApiError("当前可靠视频执行器仅支持 Wan 2.7 文生视频", 400);
      if (
        p.toolId === "text-summary" &&
        !allowed.has(p.model) &&
        !(previous?.toolId === p.toolId && previous.model === p.model)
      )
        throw new ApiError(
          "文本模型需先加入本地 TEXT_AI_ALLOWED_MODELS 白名单",
          400,
        );
    }
    const id = randomUUID(),
      revision = current.revision + 1;
    await tx.execute(
      sql`insert into ai_policy_versions(id,site_id,revision,config,actor_id,reason,request_id,request_hash,origin)values(${id},${site},${revision},${JSON.stringify(command.config)}::jsonb,${actorId},${command.reason},${command.requestId},${fingerprint},'ADMIN')`,
    );
    await tx.execute(
      sql`update ai_policy_current set version_id=${id} where site_id=${site}`,
    );
    return { id, revision, replayed: false };
  });
}
export async function budgetTotals(ex: Executor = db) {
  const [r] = await ex.execute(sql`select
 coalesce(sum(charged_micros)filter(where coalesce(dispatched_at,created_at)>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC' or status in('RESERVED','DISPATCHED','UNCERTAIN')),0) as daily,
 coalesce(sum(charged_micros)filter(where coalesce(dispatched_at,created_at)>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC' or status in('RESERVED','DISPATCHED','UNCERTAIN')),0) as monthly,
 count(*)filter(where status in('DISPATCHED','UNCERTAIN')or anomaly is not null)::int as reviews
 from ai_cost_usage where site_id=${site}`);
  return {
    daily: Number(r.daily),
    monthly: Number(r.monthly),
    reviews: Number(r.reviews),
  };
}
function deny(code: string, message: string, status = 429): never {
  throw new ApiError(message, status, { code });
}
export async function planAiTask(
  tx: Tx,
  userId: string,
  toolId: string,
  input: any,
  raw: any,
  expectedRevision?: number,
) {
  if (!["text-summary", "video-generation"].includes(toolId))
    return { config: raw, usage: null };
  const policy = await currentAiPolicy(tx, true),
    p = policy.config.profiles.find(
      (p) =>
        p.id === policy.config.defaults[toolId as keyof AiPolicy["defaults"]],
    )!;
  if (expectedRevision !== undefined && expectedRevision !== policy.revision)
    deny("QUOTE_CHANGED", "模型或售价已更新，请刷新后确认新价格再提交", 409);
  if (!p.enabled) deny("MODEL_DISABLED", "当前模型已停用，请稍后再试", 503);
  const executionConfig = {
    ...raw.executionConfig,
    model: p.model,
    ...(toolId === "text-summary"
      ? { maxTokens: p.maxTokens, timeoutMs: p.timeoutMs }
      : {}),
  };
  const config = {
    ...raw,
    model: p.model,
    credits: p.credits,
    executionConfig,
  };
  const [counts] = await tx.execute(
    sql`select count(*)filter(where created_at>now()-interval '60 seconds')::int as minute,count(*)filter(where created_at>=date_trunc('day',now() at time zone 'UTC')at time zone 'UTC')::int as day from tasks where user_id=${userId} and tool_id in('text-summary','video-generation')`,
  );
  if (Number(counts.minute) >= policy.config.perMinute)
    deny("USER_MINUTE_LIMIT", "提交过于频繁，请稍后重试");
  if (Number(counts.day) >= policy.config.perDay)
    deny("USER_DAY_LIMIT", "已达到本站今日任务限额");
  const estimate =
    toolId === "video-generation"
      ? p.fixedMicros
      : Math.max(
          1,
          Math.ceil(
            ((Buffer.byteLength(String(input.text), "utf8") + 2048) *
              p.inputUsdPerMillion +
              p.maxTokens * p.outputUsdPerMillion) *
              1.25,
          ),
        );
  const totals = await budgetTotals(tx);
  if (totals.daily + estimate > policy.config.dailyMicros)
    deny("SITE_DAY_BUDGET", "本站今日模型预算已用尽，请稍后再试", 503);
  if (totals.monthly + estimate > policy.config.monthlyMicros)
    deny("SITE_MONTH_BUDGET", "本站本月模型预算已用尽，请联系管理员", 503);
  return { config, usage: { version: policy.id, profile: p, estimate } };
}
export async function reserveAiCost(
  tx: Tx,
  id: string,
  userId: string,
  usage: Awaited<ReturnType<typeof planAiTask>>["usage"],
) {
  if (!usage) return;
  await tx.execute(
    sql`insert into ai_cost_usage(task_id,user_id,site_id,policy_version,profile_snapshot,estimate_micros,charged_micros,status)values(${id},${userId},${site},${usage.version},${JSON.stringify(usage.profile)}::jsonb,${usage.estimate},${usage.estimate},'RESERVED')`,
  );
}
export async function recordAiDenial(
  userId: string,
  requestId: string,
  error: unknown,
) {
  const code = error instanceof ApiError ? (error.details as any)?.code : null;
  if (!code) return;
  await db
    .execute(
      sql`insert into ai_governance_incidents(id,site_id,user_id,request_id,code)values(${randomUUID()},${site},${userId},${requestId},${code})on conflict do nothing`,
    )
    .catch(() => {});
}
export async function governedTask(id: string) {
  return (
    (
      await db.execute(
        sql`select task_id from ai_cost_usage where task_id=${id} and site_id=${site}`,
      )
    ).length > 0
  );
}
// Caller already holds the original user/task locks and has verified the receipt.
export async function noteAiProviderReceipt(tx: Tx, id: string) {
  await tx.execute(
    sql`update ai_cost_usage set status='DISPATCHED',dispatched_at=coalesce(dispatched_at,now()),updated_at=now() where task_id=${id} and site_id=${site} and status='RESERVED'`,
  );
}
// Persist before a paid POST. Repeated dispatch of the same task is never allowed.
export async function beginAiDispatch(id: string, token: string | null) {
  return db.transaction(async (tx) => {
    const [hint] = await tx.execute(
      sql`select user_id from tasks where id=${id}`,
    );
    if (!hint) return false;
    await tx.execute(
      sql`select id from "user" where id=${hint.user_id} for update`,
    );
    const [task] = await tx.execute(
      sql`select id from tasks where id=${id} and status='RUNNING'and lease_token=${token} and lease_until>now() for update`,
    );
    if (!task) return false;
    const rows = await tx.execute(
      sql`select status from ai_cost_usage where task_id=${id} and site_id=${site} for update`,
    );
    if (!rows.length) return true; // Already accepted legacy tasks keep their original chain.
    if (rows[0].status !== "RESERVED") return false;
    await tx.execute(
      sql`update ai_cost_usage set status='DISPATCHED',dispatched_at=now(),updated_at=now() where task_id=${id}`,
    );
    return true;
  });
}
export async function finishAiCost(
  tx: Tx,
  id: string,
  success: boolean,
  usage: any,
) {
  const [r] = await tx.execute(
    sql`select * from ai_cost_usage where task_id=${id} and site_id=${site} for update`,
  );
  if (!r || !["RESERVED", "DISPATCHED", "UNCERTAIN"].includes(String(r.status)))
    return;
  const estimate = Number(r.estimate_micros),
    p = r.profile_snapshot as AiProfile;
  if (!success) {
    await tx.execute(
      sql`update ai_cost_usage set status=${r.status === "RESERVED" ? "RELEASED" : "UNCERTAIN"},charged_micros=${r.status === "RESERVED" ? 0 : estimate},anomaly=${r.status === "RESERVED" ? null : "PROVIDER_COST_UNKNOWN"},updated_at=now()where task_id=${id}`,
    );
    return;
  }
  let cost: number | null = null;
  if (
    p.toolId === "text-summary" &&
    Number.isSafeInteger(usage?.prompt_tokens) &&
    Number.isSafeInteger(usage?.completion_tokens) &&
    usage.prompt_tokens >= 0 &&
    usage.completion_tokens >= 0
  ) {
    const v = Math.ceil(
      usage.prompt_tokens * p.inputUsdPerMillion +
        usage.completion_tokens * p.outputUsdPerMillion,
    );
    if (Number.isSafeInteger(v) && v >= 0 && v < 1e12) cost = v;
  }
  // Never free a conservative reservation solely because reported token usage is lower.
  const charged = Math.max(estimate, cost || 0),
    anomaly =
      cost !== null && cost > estimate
        ? "ESTIMATE_EXCEEDED"
        : p.toolId === "text-summary" && cost === null
          ? "MISSING_USAGE"
          : null;
  await tx.execute(
    sql`update ai_cost_usage set status=${cost === null ? "ESTIMATED" : "USAGE_ESTIMATED"},usage_micros=${cost},charged_micros=${charged},anomaly=${anomaly},updated_at=now()where task_id=${id}`,
  );
}
export async function reviewAiCost(actorId: string, body: unknown) {
  const c = costReviewSchema.parse(body),
    fingerprint = snapshotHash(c);
  return db.transaction(async (tx) => {
    const [hint] = await tx.execute(
      sql`select user_id from tasks where id=${c.taskId}`,
    );
    if (!hint) throw new ApiError("任务不存在", 404);
    // Match the user -> task -> cost order. Never wait on a policy lock after a task lock.
    const people = await tx.execute(
        sql`select id,"isAdmin","emailVerified",disabled from "user" where id in(${actorId},${hint.user_id}) order by id for update`,
      ),
      actor = people.find((p) => p.id === actorId);
    if (!actor || !actor.isAdmin || !actor.emailVerified || actor.disabled)
      throw new ApiError("仅有效管理员可以操作", 403);
    const [task] = await tx.execute(
      sql`select status from tasks where id=${c.taskId} for update`,
    );
    const [old] = await tx.execute(
      sql`select id,request_hash,actor_id from ai_cost_reviews where request_id=${c.requestId}`,
    );
    if (old) {
      if (old.request_hash !== fingerprint || old.actor_id !== actorId)
        throw new ApiError("请求编号冲突", 409);
      return { id: old.id, replayed: true };
    }
    const [row] = await tx.execute(
      sql`select * from ai_cost_usage where task_id=${c.taskId} and site_id=${site} for update`,
    );
    if (!row) throw new ApiError("该任务没有新费用记录，不能补造历史费用", 404);
    if (!["SUCCEEDED", "FAILED"].includes(String(task.status)))
      throw new ApiError(
        "执行中或核实中的任务不能释放预算，请先完成原任务核实流程",
        409,
      );
    const id = randomUUID();
    await tx.execute(
      sql`insert into ai_cost_reviews(id,request_id,request_hash,task_id,actor_id,amount_micros,evidence_reference,reason,previous_cost)values(${id},${c.requestId},${fingerprint},${c.taskId},${actorId},${c.amountMicros},${c.evidenceReference},${c.reason},${JSON.stringify(row)}::jsonb)`,
    );
    await tx.execute(
      sql`update ai_cost_usage set status='CONFIRMED',charged_micros=${c.amountMicros},confirmed_micros=${c.amountMicros},anomaly=${c.amountMicros > Number(row.estimate_micros) ? "CONFIRMED_OVER_ESTIMATE" : null},updated_at=now()where task_id=${c.taskId}`,
    );
    return { id, replayed: false };
  });
}
export async function publicGovernedConfig(
  toolId: "text-summary" | "video-generation",
  base: any,
) {
  const manifest = await readSiteManifest(),
    policy = await currentAiPolicy(),
    profile = policy.config.profiles.find(
      (p) => p.id === policy.config.defaults[toolId],
    )!;
  return {
    ...base,
    enabled: !!base.enabled && manifest.tools[toolId] && profile.enabled,
    credits: profile.credits,
    model: profile.model,
    policyRevision: policy.revision,
    profiles: policy.config.profiles
      .filter((p) => p.toolId === toolId && p.enabled)
      .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id))
      .map((p) => ({
        id: p.id,
        label: p.label,
        model: p.model,
        credits: p.credits,
        default: p.id === profile.id,
      })),
    ...(!manifest.tools[toolId]
      ? { reason: "TOOL_DISABLED" }
      : !profile.enabled
        ? { reason: "MODEL_DISABLED" }
        : {}),
  };
}
export async function aiGovernanceOverview() {
  const [policy, totals, costs, versions, reviews, incidents] =
    await Promise.all([
      currentAiPolicy(),
      budgetTotals(),
      db.execute(
        sql`select task_id,user_id,policy_version,profile_snapshot,estimate_micros,charged_micros,usage_micros,confirmed_micros,status,anomaly,created_at,updated_at from ai_cost_usage where site_id=${site} order by created_at desc limit 100`,
      ),
      db.execute(
        sql`select id,revision,actor_id,origin,reason,created_at,config from ai_policy_versions where site_id=${site} order by revision desc limit 30`,
      ),
      db.execute(
        sql`select r.id,r.task_id,r.actor_id,r.amount_micros,r.reason,r.evidence_reference,r.created_at from ai_cost_reviews r join ai_cost_usage c on c.task_id=r.task_id where c.site_id=${site} order by r.created_at desc limit 50`,
      ),
      db.execute(
        sql`select user_id,code,created_at from ai_governance_incidents where site_id=${site} order by created_at desc limit 50`,
      ),
    ]);
  return {
    policy,
    totals,
    costs,
    versions,
    reviews,
    incidents,
    capabilities: acceptedCapabilities,
    currency: "USD",
    periodTimezone: "UTC",
    estimatedCosts: true,
  };
}
