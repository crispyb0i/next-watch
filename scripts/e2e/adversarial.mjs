import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";

const favorite = (id, title = `Adversarial movie ${id}`) => ({
  tmdbId: id,
  mediaType: "movie",
  kind: "favorite",
  title,
});
const saved = (id, title) => {
  const { tmdbId, ...value } = favorite(id, title);
  return { ...value, id: tmdbId };
};
const watched = (id, title = `Adversarial watched ${id}`) => ({
  tmdbId: id,
  mediaType: "movie",
  title,
  watchedOn: "2020-02-29",
});
const library = (favorites = [], entries = []) => ({
  version: 1,
  favorites,
  watched: entries,
});

/** Real HTTP application routes and PostgreSQL; only the identity provider is local. */
export async function runAdversarialTests({
  appUrl,
  query,
  auth,
  report,
  signal,
}) {
  const origin = new URL(appUrl);
  assert.equal(origin.protocol, "http:", "E2E application must be local HTTP");
  assert.ok(
    ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname),
    "Adversarial tests must target a loopback application",
  );
  const tests = [];
  const test = async (name, action) => {
    signal?.throwIfAborted();
    const startedAt = Date.now();
    try {
      await action();
      tests.push({
        name,
        status: "passed",
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      tests.push({
        name,
        status: "failed",
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    await report?.(tests.at(-1));
  };
  const api = async (path, { token, method = "GET", body, rawBody } = {}) => {
    const response = await fetch(new URL(path, origin), {
      method,
      headers: {
        origin: origin.origin,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined || rawBody !== undefined
          ? { "content-type": "application/json" }
          : {}),
      },
      body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(20_000)])
        : AbortSignal.timeout(20_000),
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    return { status: response.status, data, headers: response.headers };
  };
  const expect = async (path, options, status) => {
    const result = await api(path, options);
    assert.equal(
      result.status,
      status,
      `${options?.method ?? "GET"} ${path}: expected ${status}, received ${result.status}`,
    );
    return result;
  };
  const rows = async (sql, values = []) => (await query(sql, values)).rows;
  const count = async (table, userId, tmdbId) => {
    assert.ok(["favorites", "watch_log"].includes(table));
    const [row] = await rows(
      `select count(*)::int as count from ${table} where user_id = $1${tmdbId === undefined ? "" : " and tmdb_id = $2"}`,
      tmdbId === undefined ? [userId] : [userId, tmdbId],
    );
    return Number(row.count);
  };
  const identity = async (name) =>
    auth.signup({
      email: `adversarial-${name}-${Date.now()}@example.test`,
      password: "Local-only-test-passphrase-42!",
      name: `Adversarial ${name}`,
    });
  const alice = await identity("alice");
  const bob = await identity("bob");

  await test("local sign-up tokens reach real verifier and private database reads", async () => {
    assert.notEqual(alice.user.id, bob.user.id);
    for (const account of [alice, bob]) {
      const response = await expect(
        "/api/favorites",
        { token: account.token },
        200,
      );
      assert.deepEqual(response.data, []);
      assert.match(response.headers.get("cache-control"), /no-store/);
    }
  });

  await test("anonymous writes fail before any application rows are created", async () => {
    const attempts = [
      ["/api/favorites", "POST", favorite(910001)],
      ["/api/favorites?tmdbId=910001", "DELETE"],
      ["/api/watched", "POST", watched(910001)],
      ["/api/watched?id=1", "PATCH", watched(910001)],
      ["/api/watched?id=1", "DELETE"],
      ["/api/library", "POST", library([saved(910001)])],
      ["/api/lists", "POST", { action: "create", title: "Unowned" }],
      ["/api/reviews", "POST", { ...favorite(910001), rating: 4 }],
    ];
    for (const [path, method, body] of attempts)
      await expect(path, { method, body }, 401);
    assert.equal(await count("favorites", alice.user.id), 0);
    assert.equal(await count("watch_log", alice.user.id), 0);
  });

  await test("invalid JWT signatures, issuer, expiry, activation and subject reject writes", async () => {
    const claims = { sub: alice.user.id, email: alice.user.email };
    const now = Math.floor(Date.now() / 1000);
    const signedParts = alice.token.split(".");
    const changedSignature = Buffer.from(signedParts[2], "base64url");
    changedSignature[0] ^= 1;
    const tokens = [
      "not.a.jwt",
      [...signedParts.slice(0, 2), changedSignature.toString("base64url")].join(
        ".",
      ),
      await auth.signToken({ ...claims, exp: now - 60 }),
      await auth.signToken({ ...claims, nbf: now + 3600 }),
      await auth.signToken({
        ...claims,
        iss: "https://wrong-issuer.example.test",
      }),
      await auth.signToken({ ...claims, sub: undefined }),
      await auth.signToken({ ...claims, sub: 123 }),
      await auth.signToken(claims, { unknownKey: true }),
    ];
    for (const token of tokens) {
      await expect(
        "/api/favorites",
        { token, method: "POST", body: favorite(910002) },
        401,
      );
      await expect(
        "/api/library",
        { token, method: "POST", body: library([saved(910002)]) },
        401,
      );
    }
    assert.equal(await count("favorites", alice.user.id), 0);
  });

  await test("verified token without required email cannot create a profile or library", async () => {
    const missingEmailId = `missing-email-${crypto.randomUUID()}`;
    const token = await auth.signToken({
      sub: missingEmailId,
      email: undefined,
    });
    await expect(
      "/api/favorites",
      { token, method: "POST", body: favorite(910003) },
      403,
    );
    await expect(
      "/api/library",
      { token, method: "POST", body: library([saved(910003)]) },
      403,
    );
    assert.deepEqual(
      await rows("select id from users where id = $1", [missingEmailId]),
      [],
    );
  });

  await test("authenticated malformed JSON is a client error with no persisted writes", async () => {
    for (const path of [
      "/api/favorites",
      "/api/watched",
      "/api/library",
      "/api/lists",
      "/api/reviews",
    ])
      await expect(
        path,
        { token: alice.token, method: "POST", rawBody: '{"unfinished":' },
        400,
      );
    assert.equal(await count("favorites", alice.user.id), 0);
    assert.equal(await count("watch_log", alice.user.id), 0);
  });

  await test("favorite owner comes from verified token despite forged body userId", async () => {
    await expect(
      "/api/favorites",
      {
        token: alice.token,
        method: "POST",
        body: {
          ...favorite(910010),
          userId: bob.user.id,
          user_id: bob.user.id,
        },
      },
      201,
    );
    assert.equal(await count("favorites", alice.user.id, 910010), 1);
    assert.equal(await count("favorites", bob.user.id, 910010), 0);
  });

  await test("concurrent duplicate favorites converge per account and retain media identities", async () => {
    await Promise.all(
      Array.from({ length: 8 }, () =>
        expect(
          "/api/favorites",
          { token: alice.token, method: "POST", body: favorite(910020) },
          201,
        ),
      ),
    );
    await expect(
      "/api/favorites",
      {
        token: bob.token,
        method: "POST",
        body: favorite(910020, "Bob's title"),
      },
      201,
    );
    await expect(
      "/api/favorites",
      {
        token: alice.token,
        method: "POST",
        body: { ...favorite(910020), mediaType: "tv", season: 0 },
      },
      201,
    );
    assert.equal(await count("favorites", alice.user.id, 910020), 2);
    assert.equal(await count("favorites", bob.user.id, 910020), 1);
    const response = await expect("/api/favorites", { token: bob.token }, 200);
    assert.equal(response.data.length, 1);
    assert.equal(response.data[0].title, "Bob's title");
  });

  await test("cross-account favorite deletion cannot remove the owner's saved item", async () => {
    await expect(
      "/api/favorites?tmdbId=910010&userId=" + alice.user.id,
      { token: bob.token, method: "DELETE" },
      200,
    );
    assert.equal(await count("favorites", alice.user.id, 910010), 1);
    await expect(
      "/api/favorites?tmdbId=910020",
      { token: bob.token, method: "DELETE" },
      200,
    );
    await expect(
      "/api/favorites?tmdbId=910020",
      { token: bob.token, method: "DELETE" },
      200,
    );
    assert.equal(await count("favorites", bob.user.id, 910020), 0);
    assert.equal(await count("favorites", alice.user.id, 910020), 2);
  });

  await test("private list visibility and all mutations enforce owner after sharing changes", async () => {
    const created = await expect(
      "/api/lists",
      {
        token: alice.token,
        method: "POST",
        body: {
          action: "create",
          title: "Alice private",
          description: "",
          shared: false,
          item: favorite(910030),
        },
      },
      201,
    );
    const id = created.data.id;
    await expect(`/api/lists?id=${id}`, {}, 404);
    await expect(`/api/lists?id=${id}`, { token: bob.token }, 404);
    const own = await expect(
      `/api/lists?id=${id}`,
      { token: alice.token },
      200,
    );
    for (const body of [
      { action: "update", title: "stolen", description: "", shared: true },
      { action: "delete" },
      { action: "add", item: favorite(910031) },
      { action: "remove", itemId: own.data.items[0].id },
    ])
      await expect(
        "/api/lists",
        { token: bob.token, method: "POST", body: { ...body, id } },
        404,
      );
    await expect(
      "/api/lists",
      {
        token: alice.token,
        method: "POST",
        body: {
          action: "update",
          id,
          title: "Alice shared",
          description: "",
          shared: true,
        },
      },
      200,
    );
    const shared = await expect(
      `/api/lists?id=${id}`,
      { token: bob.token },
      200,
    );
    assert.equal(shared.data.isOwner, false);
    await expect(
      "/api/lists",
      { token: bob.token, method: "POST", body: { action: "delete", id } },
      404,
    );
    await expect(
      "/api/lists",
      {
        token: alice.token,
        method: "POST",
        body: {
          action: "update",
          id,
          title: "Alice private again",
          description: "",
          shared: false,
        },
      },
      200,
    );
    await expect(`/api/lists?id=${id}`, { token: bob.token }, 404);
    const [persisted] = await rows(
      "select title, shared from custom_lists where id = $1",
      [id],
    );
    assert.deepEqual(persisted, {
      title: "Alice private again",
      shared: false,
    });
  });

  await test("watch-log reads, replacement and repeated deletion remain account scoped", async () => {
    const created = await expect(
      "/api/watched",
      { token: alice.token, method: "POST", body: watched(910040) },
      201,
    );
    const id = created.data.id;
    await expect(
      `/api/watched?id=${id}`,
      {
        token: bob.token,
        method: "PATCH",
        body: watched(910041, "Overwritten"),
      },
      404,
    );
    await expect(
      `/api/watched?id=${id}`,
      { token: bob.token, method: "DELETE" },
      200,
    );
    const own = await expect("/api/watched", { token: alice.token }, 200);
    assert.equal(own.data.find((entry) => entry.id === id)?.tmdbId, 910040);
    assert.deepEqual(
      (await expect("/api/watched", { token: bob.token }, 200)).data,
      [],
    );
    await expect(
      `/api/watched?id=${id}`,
      {
        token: alice.token,
        method: "PATCH",
        body: watched(910040, "Updated by owner"),
      },
      200,
    );
    await expect(
      `/api/watched?id=${id}`,
      { token: alice.token, method: "DELETE" },
      200,
    );
    await expect(
      `/api/watched?id=${id}`,
      { token: alice.token, method: "DELETE" },
      200,
    );
    assert.equal(await count("watch_log", alice.user.id, 910040), 0);
  });

  await test("repeated library imports report exact new counts and preserve account ownership", async () => {
    const body = library(
      [saved(910050), saved(910051)],
      [watched(910050), watched(910051)],
    );
    body.userId = bob.user.id;
    body.favorites[0].userId = bob.user.id;
    body.watched[0].userId = bob.user.id;
    const first = await expect(
      "/api/library",
      { token: alice.token, method: "POST", body },
      200,
    );
    const repeat = await expect(
      "/api/library",
      { token: alice.token, method: "POST", body },
      200,
    );
    assert.equal(first.data.imported, 4);
    assert.equal(repeat.data.imported, 0);
    for (const id of [910050, 910051]) {
      assert.equal(await count("favorites", alice.user.id, id), 1);
      assert.equal(await count("watch_log", alice.user.id, id), 1);
      assert.equal(await count("favorites", bob.user.id, id), 0);
      assert.equal(await count("watch_log", bob.user.id, id), 0);
    }
  });

  await test("one import batch deduplicates watch history despite different display metadata", async () => {
    const original = watched(910055);
    const body = library(
      [],
      [
        original,
        {
          ...original,
          poster: "/different-poster.jpg",
          subtitle: "Different display text",
        },
      ],
    );
    const first = await expect(
      "/api/library",
      { token: alice.token, method: "POST", body },
      200,
    );
    assert.equal(first.data.imported, 1);
    assert.equal(await count("watch_log", alice.user.id, 910055), 1);
    const repeat = await expect(
      "/api/library",
      { token: alice.token, method: "POST", body },
      200,
    );
    assert.equal(repeat.data.imported, 0);
  });

  await test("concurrent identical library imports create each watch record exactly once", async () => {
    const body = library([saved(910060)], [watched(910060)]);
    const replies = await Promise.all(
      Array.from({ length: 8 }, () =>
        expect(
          "/api/library",
          { token: alice.token, method: "POST", body },
          200,
        ),
      ),
    );
    assert.equal(
      replies.reduce((total, response) => total + response.data.imported, 0),
      2,
    );
    assert.equal(await count("favorites", alice.user.id, 910060), 1);
    assert.equal(await count("watch_log", alice.user.id, 910060), 1);
  });

  await test("invalid library entries reject the entire request before any writes", async () => {
    for (const body of [
      library(
        [saved(910070)],
        [{ ...watched(910071), watchedOn: "2023-02-29" }],
      ),
      library([saved(910070), { ...saved(910071), title: " " }]),
      library(Array.from({ length: 11 }, (_, index) => saved(910070 + index))),
    ])
      await expect(
        "/api/library",
        { token: alice.token, method: "POST", body },
        400,
      );
    assert.equal(await count("favorites", alice.user.id, 910070), 0);
    assert.equal(await count("watch_log", alice.user.id, 910071), 0);
  });

  await test("out-of-range PostgreSQL integer inputs are rejected before partial imports", async () => {
    const overflow = 2 ** 31;
    const attempts = [
      ["/api/library", library([saved(910080), saved(overflow)])],
      ["/api/favorites", favorite(overflow)],
      ["/api/watched", watched(overflow)],
      [
        "/api/library",
        library(
          [],
          [{ ...watched(910081), mediaType: "tv", season: overflow }],
        ),
      ],
    ];
    const statuses = [];
    for (const [path, body] of attempts)
      statuses.push(
        (await api(path, { token: alice.token, method: "POST", body })).status,
      );
    assert.deepEqual(
      { statuses, persisted: await count("favorites", alice.user.id, 910080) },
      { statuses: attempts.map(() => 400), persisted: 0 },
    );
  });

  await test("PostgreSQL enforces favorite uniqueness, foreign keys and season coordinates", async () => {
    const reject = async (sql, values, code) => {
      await assert.rejects(query(sql, values), (error) =>
        [error, error?.cause].some((value) => value?.code === code),
      );
    };
    await reject(
      "insert into favorites(user_id, tmdb_id, title) values ($1, $2, $3)",
      [alice.user.id, 910010, "Duplicate"],
      "23505",
    );
    await reject(
      "insert into favorites(user_id, tmdb_id, title) values ($1, $2, $3)",
      [`unknown-${crypto.randomUUID()}`, 910090, "No owner"],
      "23503",
    );
    await reject(
      "insert into favorites(user_id, tmdb_id, media_type, season, title) values ($1, $2, $3, $4, $5)",
      [alice.user.id, 910090, "movie", 1, "Invalid movie season"],
      "23514",
    );
    await reject(
      "insert into watch_log(user_id, tmdb_id, title, watched_on) values ($1, $2, $3, $4)",
      [alice.user.id, 910090, "Impossible date", "2023-02-29"],
      "22008",
    );
    assert.equal(await count("favorites", alice.user.id, 910090), 0);
    assert.equal(await count("watch_log", alice.user.id, 910090), 0);
  });

  await test("retry after a lost import response does not duplicate committed rows", async () => {
    const body = library([saved(910100)], [watched(910100)]);
    // A real completed mutation whose success body is discarded: the client
    // cannot know whether it committed and retries the same payload.
    await new Promise((resolve, reject) => {
      const request = httpRequest(
        new URL("/api/library", origin),
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${alice.token}`,
            "content-type": "application/json",
          },
        },
        (response) => {
          const status = response.statusCode;
          response.destroy();
          if (status === 200) resolve();
          else reject(new Error(`Interrupted import returned ${status}`));
        },
      );
      request.setTimeout(20_000, () =>
        request.destroy(new Error("Import timeout")),
      );
      request.on("error", reject);
      request.end(JSON.stringify(body));
    });
    const retry = await expect(
      "/api/library",
      { token: alice.token, method: "POST", body },
      200,
    );
    assert.equal(retry.data.imported, 0);
    assert.equal(await count("favorites", alice.user.id, 910100), 1);
    assert.equal(await count("watch_log", alice.user.id, 910100), 1);
  });

  await test("database failure rolls back one import batch and a clean retry imports every row", async () => {
    const [{ database }] = await rows("select current_database() as database");
    assert.match(
      database,
      /^next_watch_e2e(?:_|$)/,
      "Fault injection requires the disposable E2E database",
    );
    const constraint = "e2e_reject_import_second_row";
    const body = library([saved(910110), saved(910111)], [watched(910112)]);
    let response;
    try {
      await query(
        `alter table favorites add constraint ${constraint} check (tmdb_id <> 910111) not valid`,
      );
      response = await api("/api/library", {
        token: alice.token,
        method: "POST",
        body,
      });
    } finally {
      await query(
        `alter table favorites drop constraint if exists ${constraint}`,
      );
    }
    assert.ok(
      response.status >= 500,
      "Injected database failure must fail the HTTP request",
    );
    assert.equal(
      await count("favorites", alice.user.id, 910110),
      0,
      "The first item must roll back when the second insert fails",
    );
    assert.equal(await count("watch_log", alice.user.id, 910112), 0);
    const retry = await expect(
      "/api/library",
      { token: alice.token, method: "POST", body },
      200,
    );
    assert.equal(retry.data.imported, 3);
    assert.equal(await count("favorites", alice.user.id, 910110), 1);
    assert.equal(await count("favorites", alice.user.id, 910111), 1);
    assert.equal(await count("watch_log", alice.user.id, 910112), 1);
  });

  return {
    tests,
    passed: tests.filter((entry) => entry.status === "passed").length,
    failed: tests.filter((entry) => entry.status === "failed").length,
  };
}
