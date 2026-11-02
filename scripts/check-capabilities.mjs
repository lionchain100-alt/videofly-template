import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
const read = file => JSON.parse(readFileSync(`docs/project-state/${file}`, "utf8")).capabilities;
const baseline = read("capabilities-baseline.json");
const candidate = read("capabilities.json");
assert.equal(new Set(candidate.map(c => c.id)).size, candidate.length);
for (const previous of baseline.filter(c => c.protection === "release-critical")) {
  const current = candidate.find(c => c.id === previous.id);
  assert(current, `Missing protected capability ${previous.id}`);
  assert.equal(current.protection, previous.protection, `${current.id} protection`);
  assert.equal(current.availability, previous.availability, `${current.id} availability requires explicit governance review`);
  for (const key of ["surfaces", "testIds", "fixtures"])
    for (const value of previous[key]) assert(current[key].includes(value), `${current.id} missing ${key}: ${value}`);
}
for (const c of candidate.filter(c => c.protection === "release-critical")) {
  for (const key of ["surfaces", "testIds", "fixtures", "ownerModules", "spec"])
    assert(c[key]?.length, `${c.id} empty ${key}`);
  for (const file of [...c.fixtures, ...c.ownerModules, ...c.spec]) assert(existsSync(file), `${c.id} missing evidence/owner file: ${file}`);
}
console.log(`CAPABILITY_GATE_OK: ${baseline.length} retained, ${candidate.length} current; no removed availability/surfaces/tests/fixtures. This check does not authorize deployment.`);
