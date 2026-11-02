import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
const repo = fileURLToPath(new URL("../", import.meta.url));
const workspace = path.dirname(repo.replace(/[\\/]$/, ""));
const name = process.argv[2];
if (!/^(AUD-00[2345678]|RFN-001)-(before|after)-[0-9T-]+$/.test(name || ""))
  throw Error(
    "Provide a fixed AUD-002/AUD-003/AUD-004/AUD-005/AUD-006/AUD-007/AUD-008/RFN-001 before/after timestamp name",
  );
const target = path.join(workspace, ".recovery", name);
try {
  await stat(target);
  throw Error("Recovery destination already exists");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const env = parse(await readFile(path.join(repo, ".env.local"), "utf8"));
const secrets = Object.entries(env).filter(
  ([k, v]) =>
    /(API_KEY|PRIVATE_KEY|SECRET|PASSWORD|ACCESS_KEY|ACCESS_TOKEN|TOKEN|DATABASE_URL|ENCRYPTION_KEY|SECRET_ACCESS_KEY|ACCESS_KEY_ID)$/.test(
      k,
    ) &&
    v.length >= 8 &&
    !/^(false|true)$/.test(v),
);
const files = [
  ...new Set(
    execFileSync(
      "git",
      ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      { cwd: repo },
    )
      .toString("utf8")
      .split("\0")
      .filter(Boolean),
  ),
];
const manifest = {
  createdAt: new Date().toISOString(),
  gitHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo })
    .toString()
    .trim(),
  environmentExcluded: true,
  databaseExcluded: true,
  files: [],
};
async function copy(source, relative, redact) {
  let data = await readFile(source);
  let sanitized = false;
  for (const [key, value] of secrets) {
    if (data.includes(Buffer.from(value))) {
      if (!redact) throw Error(`Credential scan failed for ${relative}`);
      data = Buffer.from(
        data.toString("utf8").split(value).join(`<REDACTED:${key}>`),
      );
      sanitized = true;
    }
  }
  const output = path.resolve(target, relative);
  if (!output.startsWith(path.resolve(target) + path.sep))
    throw Error("Escaped recovery path");
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, data);
  manifest.files.push({
    path: relative.replaceAll("\\", "/"),
    bytes: data.length,
    sha256: createHash("sha256").update(data).digest("hex"),
    sanitized,
  });
}
for (const file of files) {
  if (
    /(^|[\/])(node_modules|\.local|\.git|\.next)([\/]|$)/.test(file) ||
    /\.(log|pid|pem|tsbuildinfo)$/.test(file) ||
    (/(^|[\/])\.env/.test(file) && file !== ".env.example")
  )
    continue;
  await copy(
    path.join(repo, file),
    path.join("videofly-template", file),
    false,
  );
}
const { readdir } = await import("node:fs/promises");
for (const file of await readdir(workspace)) {
  if (/\.(md|ps1)$/.test(file) || file === "ui-studio-concept.png")
    await copy(path.join(workspace, file), file, true);
}
await writeFile(
  path.join(target, "RECOVERY-MANIFEST.json"),
  JSON.stringify(manifest, null, 2),
);
for (const item of manifest.files) {
  const data = await readFile(path.join(target, item.path));
  if (createHash("sha256").update(data).digest("hex") !== item.sha256)
    throw Error("Recovery verification failed");
}
console.log(
  JSON.stringify({
    target,
    files: manifest.files.length,
    sanitizedDocuments: manifest.files
      .filter((f) => f.sanitized)
      .map((f) => f.path),
    verified: true,
  }),
);
