import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { siteManifestSchema } from "../src/config/site-manifest";
async function main() {
  const args = process.argv.slice(2).filter((v) => v !== "--");
  const file = "src/config/site.json";
  const raw = await readFile(file, "utf8");
  const site = siteManifestSchema.parse(JSON.parse(raw));
  if (!args.length) {
    console.log(
      'Usage: site:configure --brand "Name" --locales en,zh --default-locale en --tool video-generation=off',
    );
    process.exit(0);
  }
  for (let i = 0; i < args.length; i += 2) {
    const value = args[i + 1];
    if (value === undefined) throw new Error("Missing option value");
    switch (args[i]) {
      case "--brand":
        site.ui.brand.name = value;
        break;
      case "--locales":
        site.languages.enabled = value.split(",") as ("en" | "zh")[];
        break;
      case "--default-locale":
        site.languages.default = value as "en" | "zh";
        break;
      case "--tool": {
        const [tool, state] = value.split("=");
        if (
          !["text-summary", "video-generation"].includes(tool) ||
          !["on", "off"].includes(state)
        )
          throw new Error("Use text-summary=on/off or video-generation=on/off");
        site.tools[tool as "text-summary" | "video-generation"] =
          state === "on";
        break;
      }
      default:
        throw new Error(`Unknown option ${args[i]}`);
    }
  }
  const valid = siteManifestSchema.parse(site);
  const temporary = `${file}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile("src/config/site.previous.json", raw, { mode: 0o600 });
    await writeFile(temporary, JSON.stringify(valid, null, 2) + "\n", {
      mode: 0o600,
    });
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch(() => {});
  }
  console.log(
    `Updated ${site.id}. Restart the local site; production requires a rebuild and restart. Existing task/history/financial processing stays available.`,
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
