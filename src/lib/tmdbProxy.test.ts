import assert from "node:assert/strict";
import { serverTmdb, TmdbError } from "./server/tmdb.ts";
process.env.TMDB_API_KEY = "fixture";
let calls = 0;
globalThis.fetch = async (_url, init) => {
  calls++;
  assert.ok(init?.signal);
  return Response.json({ id: 1, title: "Fixture" });
};
await assert.rejects(
  () => serverTmdb("//outside.invalid"),
  (error: unknown) => error instanceof TmdbError && error.status === 400,
);
assert.equal(calls, 0);
await serverTmdb("/movie/1");
await serverTmdb("/movie/1");
assert.equal(calls, 1, "public responses are cached");
globalThis.fetch = async () => new Response(null, { status: 429 });
await assert.rejects(
  () => serverTmdb("/movie/2"),
  (error: unknown) => error instanceof TmdbError && error.status === 429,
);
globalThis.fetch = async () => {
  throw new TypeError("network failed");
};
await assert.rejects(
  () => serverTmdb("/movie/3"),
  (error: unknown) =>
    error instanceof TmdbError &&
    error.status === 503 &&
    !error.message.includes("fixture"),
);
console.log(
  "TMDB validation, cache, rate limiting, and network failure: passed",
);
