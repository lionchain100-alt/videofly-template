import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
async function main() {
  const { bootstrapAiPolicy } = await import("../src/services/ai-governance");
  const { db } = await import("../src/db");
  try {
    await bootstrapAiPolicy();
    console.log("AI policy initialized; no key or provider call");
  } finally {
    await db.$client.end({ timeout: 5 });
  }
}
main().catch(() => {
  console.error("AI policy initialization failed");
  process.exitCode = 1;
});
