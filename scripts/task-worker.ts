import { config } from "dotenv";
import { fileURLToPath } from "node:url";
config({
  path: fileURLToPath(new URL("../.env.local", import.meta.url)),
  quiet: true,
});

async function main() {
  const { claimTask, finishTask, recoverExpiredTasks } = await import(
    "../src/services/tasks"
  );
  const {
    executeSummary,
    textProviderConfig,
    executionSnapshot,
    snapshotHash,
    TextProviderError,
    textTaskConfig,
  } = await import("../src/ai/text-provider");
  const { summaryInputSchema } = await import(
    "../src/tools/text-summary/contract"
  );
  const { db } = await import("../src/db");
  const { startHeartbeat } = await import("../src/services/runtime-health");
  const { governedTask, beginAiDispatch } = await import(
    "../src/services/ai-governance"
  );
  const heartbeat = await startHeartbeat("text");
  let stopping = false;
  process.on("SIGTERM", () => {
    stopping = true;
  });
  process.on("SIGINT", () => {
    stopping = true;
  });
  console.log(
    "Text task worker ready. Persistent queue; no automatic paid retries.",
  );
  try {
    while (!stopping) {
      await heartbeat.progress();
      try {
        await recoverExpiredTasks();
        const task = await claimTask();
        if (!task) {
          if (process.argv.includes("--once")) break;
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        let outcome: Parameters<typeof finishTask>[2];
        try {
          let cfg = textProviderConfig();
          const governed = await governedTask(task.id);
          if (governed)
            cfg = textTaskConfig(cfg, task.executionConfig, task.credits);
          if (
            !governed &&
            snapshotHash(executionSnapshot(cfg)) !==
              snapshotHash(task.executionConfig)
          )
            throw new TextProviderError(
              "CONFIG_CHANGED",
              "模型配置已变更，原任务已释放积分，请确认新配置后重新提交。",
            );
          if (!(await beginAiDispatch(task.id, task.leaseToken)))
            throw new TextProviderError(
              "DISPATCH_UNCERTAIN",
              "调用许可已使用或租约失效，未重复调用；费用需核实。",
            );
          const result = await executeSummary(
            summaryInputSchema.parse(task.input),
            cfg,
          );
          outcome = {
            result: result.text,
            providerRequestId: result.providerRequestId,
            usage: result.usage,
          };
        } catch (e) {
          outcome =
            e instanceof TextProviderError
              ? { errorCode: e.code, errorMessage: e.message }
              : {
                  errorCode: "EXECUTION_FAILED",
                  errorMessage: "摘要执行失败，冻结积分已释放。",
                };
        }
        // Retry database persistence, never the provider request. A process crash is recovered by its lease.
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await finishTask(task.id, task.leaseToken, outcome);
            break;
          } catch {
            console.error(`Task persistence failed: ${task.id}`);
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
        console.log(`Task handled: ${task.id}`);
        if (process.argv.includes("--once")) break;
      } catch {
        console.error("Worker database unavailable; will reconnect.");
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  } finally {
    await heartbeat.stop();
    await db.$client.end({ timeout: 5 });
  }
}
main().catch(() => {
  console.error("Worker startup failed; check local database/configuration.");
  process.exitCode = 1;
});
