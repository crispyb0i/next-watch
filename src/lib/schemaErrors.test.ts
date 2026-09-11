import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import {
  isMissingSchema,
  withSchemaAvailability,
} from "./server/schemaErrors.ts";

const pg = new PGlite();
try {
  let missing: unknown;
  try {
    await pg.query("select user_id from viewing_preferences");
  } catch (cause) {
    missing = new Error("Failed query", { cause });
  }
  assert.equal(isMissingSchema(missing), true);
  assert.equal(isMissingSchema({ cause: { code: "42703" } }), true);
  assert.equal(isMissingSchema({ cause: { code: "42501" } }), false);
  assert.equal(isMissingSchema(new Error("network failure")), false);
  const circular: { cause?: unknown } = {};
  circular.cause = circular;
  assert.equal(isMissingSchema(circular), false);

  const route = withSchemaAvailability(async () => {
    throw missing;
  });
  const result = await route({} as Parameters<typeof route>[0]);
  assert.equal(result.status, 503);
  assert.equal(result.headers.get("cache-control"), "no-store");
  const body = await result.json();
  assert.match(body.error, /temporarily unavailable/);
  assert.doesNotMatch(body.error, /select|viewing_preferences|params:/);

  const unexpected = withSchemaAvailability(async () => {
    throw new Error("network failure");
  });
  await assert.rejects(
    () => Promise.resolve(unexpected({} as Parameters<typeof unexpected>[0])),
    /network failure/,
  );
} finally {
  await pg.close();
}
console.log("Pending schema handling: passed");
