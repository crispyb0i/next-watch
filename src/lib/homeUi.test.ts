import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { after, test } from "node:test";
import { JSDOM } from "jsdom";
import ts from "typescript";
import { act, createElement, useState } from "react";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://next-watch.test/",
});
const session: { user: { id: string; name: string } | null } = { user: null };
let watchingImports = 0;
let releaseWatching!: () => void;
const watchingReady = new Promise<void>((resolve) => {
  releaseWatching = resolve;
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  IS_REACT_ACT_ENVIRONMENT: true,
  __homeSession: session,
  __homeWatchingReady: watchingReady,
  __homeWatching: () => {
    // A remembered owner makes account-state retention visible to this test.
    const [owner] = useState(session.user?.id);
    return createElement("p", { "data-watching-owner": owner }, "Your shows");
  },
});

const homeURL = new URL("../components/Home.tsx", import.meta.url).href;
const failedHomeURL = `${homeURL}?chunk-failure`;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if ([homeURL, failedHomeURL].includes(context.parentURL ?? "")) {
      const mocks: Record<string, string> = {
        "../lib/auth/client":
          "export const authClient = { useSession: () => ({ data: globalThis.__homeSession.user ? globalThis.__homeSession : null }) };",
        "./Trending": 'export default () => "Trending fixture";',
        "./QueryProvider": "export default ({ children }) => children;",
        "./WatchActivity.module.css": "export default {};",
        "./CurrentlyWatching":
          context.parentURL === failedHomeURL
            ? 'throw new Error("Fixture chunk unavailable"); export default null;'
            : "await globalThis.__homeWatchingReady; export default globalThis.__homeWatching;",
      };
      if (Object.hasOwn(mocks, specifier)) {
        if (specifier === "./CurrentlyWatching") watchingImports++;
        return {
          url: `data:text/javascript,${encodeURIComponent(mocks[specifier]!)}`,
          shortCircuit: true,
        };
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if ([homeURL, failedHomeURL].includes(url))
      return {
        format: "module",
        source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
          fileName: homeURL,
          compilerOptions: {
            jsx: ts.JsxEmit.ReactJSX,
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
          },
        }).outputText,
        shortCircuit: true,
      };
    return next(url, context);
  },
});
const { createRoot } = await import("react-dom/client");
const { default: Home } = await import("../components/Home.tsx");
const { default: FailedHome } = await import(failedHomeURL);
const root = createRoot(
  document.body.appendChild(document.createElement("div")),
);
const render = (Component = Home) =>
  act(async () => root.render(createElement(Component)));

after(async () => {
  await act(async () => root.unmount());
  hooks.deregister();
  dom.window.close();
});

test("home defers private controls until signed in, keeps public content visible, and resets account state", async () => {
  await render();
  assert.equal(
    watchingImports,
    0,
    "Signed-out visitors must not load private controls",
  );
  assert.match(document.body.textContent!, /Find your next/);
  assert.match(document.body.textContent!, /Trending fixture/);

  session.user = { id: "alice", name: "Alice" };
  await render();
  assert.equal(watchingImports, 1);
  assert.match(
    document.querySelector('[role="status"]')!.textContent!,
    /Loading your shows/,
  );
  assert.match(document.body.textContent!, /Welcome back, Alice/);
  assert.match(document.body.textContent!, /Trending fixture/);

  // Switch accounts while the chunk is still in flight.
  session.user = { id: "bob", name: "Bob" };
  await render();
  await act(async () => {
    releaseWatching();
    await watchingReady;
    await new Promise((resolve) => setImmediate(resolve));
  });
  assert.equal(
    document
      .querySelector("[data-watching-owner]")
      ?.getAttribute("data-watching-owner"),
    "bob",
  );
  assert.doesNotMatch(document.body.textContent!, /Alice/);

  session.user = { id: "alice", name: "Alice" };
  await render();
  assert.equal(
    document
      .querySelector("[data-watching-owner]")
      ?.getAttribute("data-watching-owner"),
    "alice",
  );
  assert.equal(
    watchingImports,
    1,
    "The resolved chunk is reused without retaining account state",
  );

  session.user = null;
  await render();
  assert.equal(document.querySelector("[data-watching-owner]"), null);
  assert.equal(document.querySelector('[role="status"]'), null);
  assert.match(document.body.textContent!, /Find your next/);
});

test("a failed private chunk keeps the public homepage visible and offers a full reload", async () => {
  session.user = { id: "alice", name: "Alice" };
  await render(FailedHome);
  await act(async () => {
    await new Promise((resolve) => setImmediate(resolve));
  });
  assert.match(
    document.querySelector('[role="alert"]')!.textContent!,
    /Could not load your shows/,
  );
  assert.match(document.body.textContent!, /Welcome back, Alice/);
  assert.match(document.body.textContent!, /Trending fixture/);
  const reload = document.querySelector('[role="alert"] a')!;
  assert.equal(reload.getAttribute("href"), "/");
  assert.equal(reload.getAttribute("data-astro-reload"), "true");
  assert.equal(reload.textContent, "Reload page");
});
