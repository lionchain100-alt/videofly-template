import { config } from "dotenv";
import { fileURLToPath } from "node:url";
config({ path: fileURLToPath(new URL("../.env.local", import.meta.url)), quiet: true });
async function main() {
  const { claimVideoJob, processVideoJob } = await import("../src/services/video-jobs");
  const { db } = await import("../src/db");
  let stopping = false;
  process.on("SIGTERM", () => {
    stopping = true;
  });
  process.on("SIGINT", () => {
    stopping = true;
  });
  console.log(
    "Video worker ready; durable submission, polling and local storage. Uncertain submissions require review.",
  );
  try {
    while (!stopping) {
      try {
        const claim = await claimVideoJob();
        if (claim) {
          await processVideoJob(claim);
          console.log(`Video step handled: ${claim.task.id}`);
        } else await new Promise((r) => setTimeout(r, 1000));
        if (process.argv.includes("--once")) break;
      } catch {
        console.error("Video worker step interrupted; lease recovery will resume safely.");
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  } finally {
    await db.$client.end({ timeout: 5 });
  }
}
main().catch(() => {
  console.error("Video worker startup failed.");
  process.exitCode = 1;
});
