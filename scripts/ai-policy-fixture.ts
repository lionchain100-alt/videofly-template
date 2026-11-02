import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { siteManifest } from "../src/config/site-manifest";
import { policySchema, type AiPolicy } from "../src/ai/governance-contract";
// Test-only maintenance fixture, never imported by the application.
// No managed Workers may run while a temporary policy is installed.
export async function aiPolicyFixture(
  q: postgres.Sql,
  configure?: (p: AiPolicy) => void,
) {
  const url = new URL(process.env.DATABASE_URL!);
  if (
    url.hostname !== "127.0.0.1" ||
    url.port !== "55432" ||
    url.pathname !== "/laconic_local" ||
    process.env.NODE_ENV === "production"
  )
    throw Error("Dedicated local fixture DB only");
  const [active] =
    await q`select count(*)::int as n from worker_heartbeats where status='RUNNING' and heartbeat_at>now()-interval '30 seconds'`;
  if (active.n) throw Error("Stop all managed Workers before policy fixtures");
  const id = randomUUID(),
    site = siteManifest.id;
  const prior = await q.begin(async (rawTx) => {
    const tx = rawTx as unknown as typeof q;
    await tx`select site_id from ai_policy_current where site_id=${site} for update`;
    const [old] =
      await tx`select v.* from ai_policy_versions v join ai_policy_current c on c.version_id=v.id where c.site_id=${site}`;
    const config = policySchema.parse(old.config);
    config.perMinute = 100000;
    config.perDay = 1000000;
    config.dailyMicros = 1e12;
    config.monthlyMicros = 1e12;
    for (const p of config.profiles) {
      if (p.toolId === "text-summary") {
        p.model = process.env.TEXT_AI_MODEL || p.model;
        p.credits = Number(process.env.TEXT_SUMMARY_CREDITS || p.credits);
        p.maxTokens = Number(
          process.env.TEXT_AI_MAX_OUTPUT_TOKENS || p.maxTokens,
        );
        p.timeoutMs = Number(process.env.TEXT_AI_TIMEOUT_MS || p.timeoutMs);
      }
      if (p.toolId === "video-generation")
        p.credits = Number(process.env.VIDEO_GENERATION_CREDITS || p.credits);
      p.enabled = true;
    }
    configure?.(config);
    policySchema.parse(config);
    const [next] =
      await tx`select coalesce(max(revision),0)+1 as n from ai_policy_versions where site_id=${site}`;
    await tx`insert into ai_policy_versions(id,site_id,revision,config,reason,request_id,request_hash,origin)values(${id},${site},${next.n},${q.json(config)},'Isolated local maintenance regression fixture; restored on exit',${randomUUID()},'local-fixture','LOCAL_TEST')`;
    await tx`update ai_policy_current set version_id=${id} where site_id=${site}`;
    return old;
  });
  return {
    id,
    original: prior,
    async restore(alsoActor?: string) {
      await q.begin(async (rawTx) => {
        const tx = rawTx as unknown as typeof q;
        const [current] =
          await tx`select v.id,v.actor_id,v.origin from ai_policy_versions v join ai_policy_current c on c.version_id=v.id where c.site_id=${site} for update of c`;
        if (current.id !== id && (!alsoActor || current.actor_id !== alsoActor))
          throw Error(
            "Policy changed outside this fixture; refusing to overwrite it",
          );
        await tx`update ai_policy_current set version_id=${prior.id} where site_id=${site}`;
        if (alsoActor)
          await tx`delete from ai_policy_versions where actor_id=${alsoActor}`;
        await tx`delete from ai_policy_versions where id=${id} and origin='LOCAL_TEST'`;
      });
    },
  };
}
