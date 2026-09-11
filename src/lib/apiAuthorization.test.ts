import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
let authenticated = false,
  reads = 0,
  writes = 0;
Object.assign(globalThis, {
  __auditAuth: () => (authenticated ? "viewer" : null),
  __auditRead: () => {
    reads++;
    return [];
  },
  __auditWrite: () => {
    writes++;
    throw new Error("Unexpected database write");
  },
});
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith("/db") || specifier.endsWith("/db/index.ts"))
      return {
        url:
          "data:text/javascript," +
          encodeURIComponent(
            `const chain={from(){return this},innerJoin(){return this},where(){return Promise.resolve(globalThis.__auditRead())}};export const db={select(){return chain},insert:globalThis.__auditWrite,update:globalThis.__auditWrite,delete:globalThis.__auditWrite};`,
          ),
        shortCircuit: true,
      };
    if (specifier.endsWith("auth/server"))
      return {
        url:
          "data:text/javascript," +
          encodeURIComponent(
            `export const sessionUserId=async()=>globalThis.__auditAuth();export const syncUser=async()=>true;export const verifySession=async()=>globalThis.__auditAuth()?{sub:'viewer',email:'fixture@example.invalid'}:null;`,
          ),
        shortCircuit: true,
      };
    if (specifier.startsWith(".") && context.parentURL) {
      const url = new URL(specifier, context.parentURL);
      if (existsSync(new URL(url.href + ".ts")))
        return next(url.href + ".ts", context);
    }
    return next(specifier, context);
  },
});
const routes = await Promise.all(
  [
    "favorites",
    "watched",
    "feed",
    "nights",
    "alerts",
    "taste",
    "progress",
    "library",
  ].map((name) => import(`../pages/api/${name}.ts`)),
);
for (const route of routes) {
  for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
    if (!route[method]) continue;
    const request = new Request("https://app.invalid/api/test", {
      method,
      ...(method === "GET" ? {} : { body: "{}" }),
    });
    assert.equal(
      (await route[method]({ request, url: new URL(request.url) })).status,
      401,
    );
  }
}
assert.equal(reads, 0);
assert.equal(writes, 0);
authenticated = true;
for (const name of ["nights", "alerts", "library"]) {
  const route = await import(`../pages/api/${name}.ts`);
  const request = new Request("https://app.invalid/api/test", {
    method: "POST",
    body: "not json",
  });
  assert.equal(
    (await route.POST({ request, url: new URL(request.url) })).status,
    400,
  );
}
const nights = await import("../pages/api/nights.ts");
const request = new Request("https://app.invalid/api/nights", {
  method: "POST",
  body: JSON.stringify({
    action: "vote",
    id: "00000000-0000-0000-0000-000000000000",
    tmdbId: 1,
    mediaType: "movie",
  }),
});
assert.equal(
  (await nights.POST({ request } as Parameters<typeof nights.POST>[0])).status,
  403,
);
assert.equal(writes, 0);
for (const name of ["feed", "watched"]) {
  const route = await import(`../pages/api/${name}.ts`);
  const request = new Request("https://app.invalid/api/test?limit=1.5");
  assert.equal(
    (await route.GET({ request, url: new URL(request.url) })).status,
    400,
  );
}
console.log("API authorization and invalid requests: passed");
