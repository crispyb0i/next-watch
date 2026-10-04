import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { after, afterEach, test } from "node:test";
import { JSDOM } from "jsdom";
import ts from "typescript";
import { act, createElement, type ReactElement } from "react";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://next-watch.test/alerts",
});
const auth = { userId: "alice" };
interface Preferences {
  region: string;
  providerIds: number[];
  watchlistPublic: boolean;
}
interface AlertData {
  preferences: Preferences;
  alerts: {
    id: number;
    title: string;
    href: string;
    message: string;
    createdAt: string;
    readAt: null;
  }[];
}
const alice: AlertData = {
  preferences: { region: "GB", providerIds: [8], watchlistPublic: true },
  alerts: [
    {
      id: 1,
      title: "Alice's saved movie",
      href: "/movie?id=1",
      message: "Available now",
      createdAt: "2024-01-01T00:00:00Z",
      readAt: null,
    },
  ],
};
const bob: AlertData = {
  preferences: { region: "DE", providerIds: [9], watchlistPublic: false },
  alerts: [],
};
let responses = new Map<string, AlertData | Promise<AlertData>>();
const reads: string[] = [];
const saves: { userId: string; body: unknown }[] = [];
const calls: { path: string; userId: string }[] = [];
let tokenResponse: Promise<string> | undefined;
let favoriteReloads = 0;
let downloads = 0;
function fixtureResponse(path: string, userId: string, body: unknown) {
  assert.equal(path, "/api/alerts");
  if (body !== undefined) return { ok: true };
  const response = responses.get(userId);
  assert.ok(response, "Every account request must use a safe fixture");
  return response;
}
let respond: (path: string, userId: string, body: unknown) => unknown =
  fixtureResponse;
const originalFetch = globalThis.fetch;
const originalCreateObjectURL = URL.createObjectURL;
URL.createObjectURL = () => {
  downloads++;
  return "blob:fixture";
};
dom.window.HTMLAnchorElement.prototype.click = function () {};
globalThis.fetch = async (input, init) => {
  const path = String(input);
  const authorization = new Headers(init?.headers).get("authorization");
  assert.match(authorization ?? "", /^Bearer (alice|bob)-token$/);
  const userId = authorization!.slice(7, -6);
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  calls.push({ path, userId });
  if (body === undefined) reads.push(userId);
  else saves.push({ userId, body });
  // Deliberately allow late responses after abort to verify our caller also
  // stops before later batches and UI/download side effects.
  return Response.json(await respond(path, userId, body));
};
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  localStorage: dom.window.localStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
  __authGateUiSession: auth,
  __authGateUiToken: () =>
    tokenResponse ?? Promise.resolve(`${auth.userId}-token`),
  __authGateUiReloadFavorites: () => favoriteReloads++,
});

const sourceRoot = new URL("../", import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.startsWith(sourceRoot)) {
      const mocks: Record<string, string> = {
        "auth/client":
          "export const getJWTToken = globalThis.__authGateUiToken; export const authClient = { useSession: () => ({ data: { user: { id: globalThis.__authGateUiSession.userId } }, isPending: false }) };",
        "auth/gate": "export const signInHref = () => '/auth/sign-in';",
        favorites:
          "export const reloadFavorites = async () => globalThis.__authGateUiReloadFavorites();",
        tmdb: `export const getProviderCatalog = async () => ({ results: [
          { provider_id: 8, provider_name: "Service 8" },
          { provider_id: 9, provider_name: "Service 9" }
        ] }); export const searchPage = async () => { throw new Error("Unexpected search"); };`,
      };
      for (const [suffix, source] of Object.entries(mocks)) {
        if (specifier.endsWith(suffix))
          return {
            url: `data:text/javascript,${encodeURIComponent(source)}`,
            shortCircuit: true,
          };
      }
      if (specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier)) {
        for (const extension of [".ts", ".tsx"]) {
          const url = new URL(`${specifier}${extension}`, context.parentURL);
          if (existsSync(url)) return { url: url.href, shortCircuit: true };
        }
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith(sourceRoot) && url.endsWith(".tsx"))
      return {
        format: "module",
        source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
          fileName: url,
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
const { default: AvailabilityAlerts } =
  await import("../components/AvailabilityAlerts.tsx");
const { default: LibraryTransfer } =
  await import("../components/LibraryTransfer.tsx");
const { accountApi } = await import("./accountApi.ts");
let root: ReturnType<typeof createRoot> | undefined;
async function render(
  element: ReactElement = createElement(AvailabilityAlerts),
) {
  root ??= createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => root!.render(element));
}
function deferred<T = AlertData>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}
function publicCheckbox() {
  return [...document.querySelectorAll("label")]
    .find((label) => label.textContent?.includes("Show my watchlist"))!
    .querySelector("input")!;
}
function regionInput() {
  return document.querySelector<HTMLInputElement>('input[maxlength="2"]')!;
}
async function savePreferences() {
  await act(async () => {
    document
      .querySelector("form")!
      .dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
  });
}
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  localStorage.clear();
  auth.userId = "alice";
  responses = new Map();
  respond = fixtureResponse;
  tokenResponse = undefined;
  favoriteReloads = 0;
  downloads = 0;
  reads.length = 0;
  saves.length = 0;
  calls.length = 0;
});
after(() => {
  globalThis.fetch = originalFetch;
  URL.createObjectURL = originalCreateObjectURL;
  dom.window.close();
});

test("account changes clear private alerts and cannot save the previous account's preferences", async () => {
  const bobRequest = deferred();
  responses.set("alice", alice);
  responses.set("bob", bobRequest.promise);
  await render();
  assert.match(document.body.textContent!, /Alice's saved movie/);
  assert.equal(regionInput().value, "GB");
  assert.equal(publicCheckbox().checked, true);

  auth.userId = "bob";
  await render();
  assert.doesNotMatch(document.body.textContent!, /Alice's saved movie/);
  assert.equal(publicCheckbox().checked, false);
  assert.equal(
    document.querySelector<HTMLButtonElement>("form button")!.disabled,
    true,
  );

  await act(async () => bobRequest.resolve(bob));
  assert.equal(regionInput().value, "DE");
  assert.equal(publicCheckbox().checked, false);
  await savePreferences();
  assert.deepEqual(saves, [
    { userId: "bob", body: { action: "preferences", ...bob.preferences } },
  ]);
  assert.deepEqual(reads, ["alice", "bob"]);
});

test("a deferred response from the previous account cannot replace the current account's alerts or preferences", async () => {
  const aliceRequest = deferred();
  responses.set("alice", aliceRequest.promise);
  responses.set("bob", bob);
  await render();
  auth.userId = "bob";
  await render();
  assert.equal(regionInput().value, "DE");

  await act(async () => aliceRequest.resolve(alice));
  assert.equal(regionInput().value, "DE");
  assert.equal(publicCheckbox().checked, false);
  assert.doesNotMatch(document.body.textContent!, /Alice's saved movie/);
  await savePreferences();
  assert.deepEqual(saves, [
    { userId: "bob", body: { action: "preferences", ...bob.preferences } },
  ]);
});

test("same-account session refresh preserves unsaved preferences", async () => {
  responses.set("alice", alice);
  await render();
  await act(async () => publicCheckbox().click());
  assert.equal(publicCheckbox().checked, false);
  await render();
  assert.equal(publicCheckbox().checked, false);
  assert.deepEqual(reads, ["alice"]);
  await savePreferences();
  assert.deepEqual(saves, [
    {
      userId: "alice",
      body: {
        action: "preferences",
        ...alice.preferences,
        watchlistPublic: false,
      },
    },
  ]);
});

async function clickButton(label: string) {
  const button = [...document.querySelectorAll("button")].find(
    (item) => item.textContent === label,
  );
  assert.ok(button, `Missing button: ${label}`);
  assert.equal(button.disabled, false);
  await act(async () => button.click());
}

async function selectLibrary() {
  const text = JSON.stringify({
    version: 1,
    favorites: [],
    watched: Array.from({ length: 11 }, (_, i) => ({
      tmdbId: i + 1,
      title: `Private movie ${i + 1}`,
      watchedOn: "2024-01-01",
    })),
  });
  const input = document.querySelector('input[type="file"]')!;
  Object.defineProperty(input, "files", {
    value: [
      { name: "library.json", size: text.length, text: async () => text },
    ],
  });
  await act(async () => {
    input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
}

test("an account change during an import stops remaining batches and cache reloads", async () => {
  const firstBatch = deferred<{ imported: number }>();
  respond = () => firstBatch.promise;
  await render(createElement(LibraryTransfer));
  await selectLibrary();
  await clickButton("Import these entries");
  assert.equal(saves.length, 1);
  assert.equal(saves[0].userId, "alice");
  auth.userId = "bob";
  await render(createElement(LibraryTransfer));
  await act(async () => firstBatch.resolve({ imported: 10 }));
  assert.equal(saves.length, 1, "The second batch must never write as Bob");
  assert.equal(favoriteReloads, 0);
  assert.doesNotMatch(document.body.textContent!, /Private movie/);
});

test("same-account refresh keeps an import running through every batch", async () => {
  const firstBatch = deferred<{ imported: number }>();
  respond = (path, userId, body) => {
    assert.equal(path, "/api/library");
    assert.equal(userId, "alice");
    return (body as { watched: unknown[] }).watched.length === 10
      ? firstBatch.promise
      : { imported: 1 };
  };
  await render(createElement(LibraryTransfer));
  await selectLibrary();
  await clickButton("Import these entries");
  await render(createElement(LibraryTransfer));
  await act(async () => firstBatch.resolve({ imported: 10 }));
  assert.equal(saves.length, 2);
  assert.ok(saves.every((save) => save.userId === "alice"));
  assert.equal(favoriteReloads, 1);
  assert.match(document.body.textContent!, /Imported 11 new entries/);
  assert.doesNotMatch(document.body.textContent!, /Import preview/);
});

test("an account change during availability checks stops remaining pages", async () => {
  const firstPage = deferred<{
    checked: number;
    failed: number;
    nextOffset: number;
  }>();
  responses.set("alice", alice);
  responses.set("bob", bob);
  respond = (path, userId, body) => {
    const check = body as { action?: string; offset?: number } | undefined;
    return check?.action === "check"
      ? check.offset === 0
        ? firstPage.promise
        : { checked: 1, failed: 0, nextOffset: null }
      : fixtureResponse(path, userId, body);
  };
  await render();
  await clickButton("Check my watchlist");
  assert.equal(saves.length, 2);
  auth.userId = "bob";
  await render();
  await act(async () =>
    firstPage.resolve({ checked: 10, failed: 0, nextOffset: 10 }),
  );
  assert.equal(
    saves.length,
    2,
    "The next availability page must not run as Bob",
  );
  assert.ok(saves.every((save) => save.userId === "alice"));
  assert.equal(regionInput().value, "DE");
});

test("an account change during export stops pagination and suppresses the download", async () => {
  const firstPage = deferred<unknown[]>();
  respond = (path) =>
    path === "/api/watched?limit=100&offset=0" ? firstPage.promise : [];
  await render(createElement(LibraryTransfer));
  await clickButton("Export my library");
  assert.equal(calls.length, 2);
  auth.userId = "bob";
  await render(createElement(LibraryTransfer));
  await act(async () =>
    firstPage.resolve(Array.from({ length: 100 }, () => ({}))),
  );
  assert.equal(calls.length, 2);
  assert.equal(downloads, 0);
});

test("an aborted account request cannot send a token resolved after cancellation", async () => {
  const token = deferred<string>();
  tokenResponse = token.promise;
  const controller = new AbortController();
  const request = accountApi(
    "/api/alerts",
    { action: "read" },
    controller.signal,
  );
  controller.abort();
  token.resolve("bob-token");
  await assert.rejects(request, { name: "AbortError" });
  assert.equal(calls.length, 0);
});
