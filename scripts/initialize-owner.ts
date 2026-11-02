import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
async function main() {
  const args = process.argv.slice(2),
    get = (k: string) => args[args.indexOf(k) + 1],
    apply = args.includes("--apply");
  if (!args.includes("--email") || !args.includes("--reason"))
    throw Error(
      "Usage: initialize-owner.ts --email <verified account> --reason <12-300 chars> [--apply --site <site id>]",
    );
  const { siteManifest } = await import("../src/config/site-manifest");
  if (apply && get("--site") !== siteManifest.id)
    throw Error("Explicit matching --site is required");
  const { bootstrapOwner } = await import(
      "../src/services/owner-initialization"
    ),
    { db } = await import("../src/db");
  try {
    console.log(await bootstrapOwner(get("--email"), get("--reason"), apply));
  } finally {
    await db.$client.end({ timeout: 5 });
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
