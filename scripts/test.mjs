import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
async function tests(path) {
  const result = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = `${path}/${entry.name}`;
    if (entry.isDirectory()) result.push(...(await tests(file)));
    else if (
      entry.name.endsWith(".test.ts") &&
      entry.name !== "follows.test.ts"
    )
      result.push(file);
  }
  return result;
}
const result = spawnSync(
  process.execPath,
  ["--experimental-strip-types", "--test", ...(await tests("src"))],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
