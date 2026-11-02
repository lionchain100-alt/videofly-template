import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const passed = [];
for (const [port, name, prefix] of [
  [3001, "Laconic", "/zh"],
  [3003, "Aurora Notes", ""],
]) {
  const base = `http://localhost:${port}`;
  const request = (route, init = {}) =>
    fetch(base + route, {
      redirect: "manual",
      signal: AbortSignal.timeout(60000),
      ...init,
    });
  const home = await request(prefix || "/");
  assert.equal(home.status, 200);
  const html = await home.text();
  assert(html.includes(name));
  assert(!html.includes("VideoFly"));
  assert(html.includes("/api/site/icon"));
  assert(!html.includes("__SITE_NAME__"));
  for (const [from, to] of [
    ["/dashboard", "/"],
    ["/dashboard/videos", "/my-creations"],
    ["/dashboard/billing", "/credits"],
  ]) {
    const response = await request(from);
    assert.equal(response.status, 307);
    assert.equal(new URL(response.headers.get("location"), base).pathname, to);
  }
  for (const route of ["/ui-studio", "/ui-preview"])
    assert.equal((await request(route)).status, 404);
  assert.equal((await request("/api/ui-studio/config")).status, 403);
  assert.equal(
    (
      await request("/api/ui-studio/config", {
        method: "PUT",
        body: "{}",
        headers: { Origin: base, "Content-Type": "application/json" },
      })
    ).status,
    403,
  );
  const login = await request(`${prefix}/login`);
  assert.equal(login.status, 200);
  assert(!(await login.text()).includes("local-password"));
  const auth = await request("/api/auth/sign-in/email", {
    method: "POST",
    headers: {
      Origin: port === 3001 ? "http://localhost:3000" : "http://localhost:3002",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: "qa@example.com",
      password: "NeverARealCredential",
    }),
  });
  assert(auth.status >= 400 && auth.status < 500);
  const icon = await request("/api/site/icon");
  assert.equal(icon.status, 200);
  assert(
    (await icon.text()).includes(port === 3001 ? ">L</text>" : ">A</text>"),
  );
  const og = await request("/api/site/og");
  assert.equal(og.status, 200);
  assert.equal(og.headers.get("Content-Type"), "image/png");
  const png = Buffer.from(await og.arrayBuffer());
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  if (port === 3003) {
    assert.equal((await request("/text-to-video")).status, 404);
    assert.equal((await request("/en/login")).status, 404);
    assert(!html.includes("切换到视频生成"));
  }
  passed.push(
    `${name}: production homepage/brand assets work; local password and Studio page/API disabled`,
  );
  console.log("PASS " + passed.at(-1));
}
await writeFile(
  "docs/project-state/aud-003-production-results.json",
  JSON.stringify(
    { testedAt: new Date().toISOString(), passed, providerCalls: 0 },
    null,
    2,
  ) + "\n",
);
