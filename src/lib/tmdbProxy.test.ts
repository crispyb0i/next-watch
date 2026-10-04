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
// A cold key is shared, including when equivalent parameters arrive in a
// different order. Cancellation belongs to each viewer, not the upstream load.
let release!: (response: Response) => void;
let upstreamSignal: AbortSignal | null | undefined;
calls = 0;
globalThis.fetch = async (_url, init) => {
  calls++;
  upstreamSignal = init?.signal;
  return new Promise<Response>((resolve) => {
    release = resolve;
  });
};
const cancelled = new AbortController();
const cancelledRequest = serverTmdb(
  "/movie/10",
  { language: "en-US", page: "1" },
  cancelled.signal,
);
const remaining = Array.from({ length: 24 }, () =>
  serverTmdb(
    "/movie/10",
    { page: "1", language: "en-US" },
    new AbortController().signal,
  ),
);
assert.equal(calls, 1, "25 identical cold requests share one upstream fetch");
const rejected = assert.rejects(
  cancelledRequest,
  (error: unknown) => error instanceof TmdbError && error.status === 503,
);
cancelled.abort();
await rejected;
assert.ok(upstreamSignal);
assert.equal(upstreamSignal.aborted, false, "one caller cannot abort others");
release(Response.json({ id: 10 }));
assert.deepEqual(await Promise.all(remaining), Array(24).fill({ id: 10 }));
assert.deepEqual(
  await serverTmdb("/movie/10", { language: "en-US", page: "1" }),
  {
    id: 10,
  },
);
assert.equal(calls, 1, "the shared result is cached");

const alreadyCancelled = new AbortController();
alreadyCancelled.abort();
await assert.rejects(
  () => serverTmdb("/movie/11", {}, alreadyCancelled.signal),
  (error: unknown) => error instanceof TmdbError && error.status === 503,
);
assert.equal(calls, 1, "an already cancelled caller starts no upstream work");

calls = 0;
globalThis.fetch = async () => {
  calls++;
  return new Promise<Response>((resolve) => {
    release = resolve;
  });
};
const failures = Array.from({ length: 25 }, () =>
  assert.rejects(
    () => serverTmdb("/movie/12"),
    (error: unknown) => error instanceof TmdbError && error.status === 429,
  ),
);
assert.equal(calls, 1);
release(new Response(null, { status: 429 }));
await Promise.all(failures);
globalThis.fetch = async () => {
  calls++;
  return Response.json({ id: 12 });
};
assert.deepEqual(await serverTmdb("/movie/12"), { id: 12 });
assert.equal(calls, 2, "failed shared requests do not poison retries");

// Keep the existing ten-second upper bound on the shared network request.
const timeout = new AbortController();
const originalTimeout = AbortSignal.timeout;
try {
  AbortSignal.timeout = (milliseconds) => {
    assert.equal(milliseconds, 10_000);
    return timeout.signal;
  };
  globalThis.fetch = async (_url, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(new Error("timeout")),
      );
    });
  const timedOut = [0, 1].map(() =>
    assert.rejects(
      () => serverTmdb("/movie/13"),
      (error: unknown) => error instanceof TmdbError && error.status === 503,
    ),
  );
  timeout.abort();
  await Promise.all(timedOut);
} finally {
  AbortSignal.timeout = originalTimeout;
}
console.log(
  "TMDB validation, cache, concurrent deduplication (25 to 1), isolated cancellation, retry, timeout, and failures: passed",
);
