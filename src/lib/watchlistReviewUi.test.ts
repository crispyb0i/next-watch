import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { after, afterEach, test } from "node:test";
import { JSDOM } from "jsdom";
import ts from "typescript";
import { act, createElement, type ReactElement } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://next-watch.test/watchlist",
  pretendToBeVisual: true,
});
const auth = { token: "test-token" as string | null };
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  localStorage: dom.window.localStorage,
  CustomEvent: dom.window.CustomEvent,
  FormData: dom.window.FormData,
  IS_REACT_ACT_ENVIRONMENT: true,
  __nextWatchUiAuth: auth,
});

// JSDOM lacks native modal behavior. These shims test our open/close state;
// browser focus trapping, Escape, and focus return still need manual verification.
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
  this.dispatchEvent(new dom.window.Event("close"));
};

const sourceRoot = new URL("../", import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.startsWith(sourceRoot)) {
      if (specifier.endsWith("auth/client"))
        return {
          url: `data:text/javascript,${encodeURIComponent("export const getJWTToken = async () => globalThis.__nextWatchUiAuth.token; export const authClient = { useSession: () => ({ data: { user: { id: 'test-user' } }, isPending: false }) };")}`,
          shortCircuit: true,
        };
      if (specifier.endsWith("auth/gate"))
        return {
          url: "data:text/javascript,export const requireAuth=async()=>true; export const signInHref=()=>'/auth/sign-in';",
          shortCircuit: true,
        };
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
const { default: ReviewButton } =
  await import("../components/ReviewButton.tsx");
const { default: Favorites } = await import("../components/Favorites.tsx");
const { default: QueryProvider } =
  await import("../components/QueryProvider.tsx");
const { _resetForTest, getFavorites } = await import("./favorites.ts");
let root: ReturnType<typeof createRoot> | undefined;
let client: QueryClient;
function CaptureClient() {
  client = useQueryClient();
  client.setDefaultOptions({
    queries: { retry: false, gcTime: Infinity, staleTime: 5 * 60_000 },
    mutations: { gcTime: Infinity },
  });
  return null;
}
async function mount(element: ReactElement) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      createElement(QueryProvider, null, createElement(CaptureClient), element),
    ),
  );
}
function button(label: string) {
  const element = [...document.querySelectorAll("button")].find(
    (item) =>
      item.getAttribute("aria-label") === label ||
      item.textContent?.trim() === label,
  );
  assert.ok(element, `Button not found: ${label}`);
  return element;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
async function waitFor(check: () => void) {
  for (let attempt = 0; ; attempt++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    try {
      check();
      return;
    } catch (error) {
      if (attempt === 99) throw error;
    }
  }
}
const movie = { tmdbId: 603, mediaType: "movie" as const, title: "The Matrix" };
const review = { ...movie, id: 7, rating: 4, review: "Saved review" };
afterEach(async () => {
  await act(async () => root?.unmount());
  client?.clear();
  document.body.replaceChildren();
  auth.token = "test-token";
  _resetForTest([]);
});
after(() => dom.window.close());

test("review load failure requires retry before editing and preserves the existing review", async () => {
  let fail = true;
  globalThis.fetch = async () =>
    fail ? new Response("unavailable", { status: 503 }) : Response.json(review);
  await mount(createElement(ReviewButton, { item: movie }));
  await click("Write a review");
  await waitFor(() =>
    assert.match(
      document.querySelector('[role="alert"]')?.textContent ?? "",
      /Couldn't load/,
    ),
  );
  assert.equal(document.querySelector("form"), null);
  const dialog = document.querySelector("dialog")!;
  assert.match(
    document.getElementById(dialog.getAttribute("aria-labelledby")!)
      ?.textContent ?? "",
    /The Matrix/,
  );
  fail = false;
  await click("Retry");
  await waitFor(() =>
    assert.equal(document.querySelector("textarea")?.value, "Saved review"),
  );
  button("Update review");
  assert.equal(
    document.querySelector<HTMLInputElement>('input[value="4"]')?.checked,
    true,
  );
  let request: RequestInit | undefined;
  globalThis.fetch = async (_url, init) => {
    if (init?.method === "PATCH") request = init;
    return Response.json(review);
  };
  document.querySelector("textarea")!.value = "Updated review";
  await click("Update review");
  await waitFor(() =>
    assert.equal(document.querySelector("dialog")?.open, false),
  );
  assert.equal(request?.method, "PATCH");
  assert.equal(JSON.parse(String(request?.body)).review, "Updated review");
});

test("slow review requests remain closable and a missing session is an error, not a new review", async () => {
  let finish!: (response: Response) => void;
  globalThis.fetch = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  await mount(createElement(ReviewButton, { item: movie }));
  await click("Write a review");
  assert.match(
    document.querySelector('[role="status"]')?.textContent ?? "",
    /Loading/,
  );
  await click("Close review dialog");
  assert.equal(document.querySelector("dialog")?.open, false);
  await act(async () => finish(Response.json(null)));
  await waitFor(() => assert.equal(document.querySelector("form"), null));
  client.clear();
  auth.token = null;
  await click("Write a review");
  await waitFor(() =>
    assert.match(
      document.querySelector('[role="alert"]')?.textContent ?? "",
      /Sign in/,
    ),
  );
  assert.equal(document.querySelector("form"), null);
});

test("review cancellation discards drafts; save failure leaves the draft available to retry", async () => {
  globalThis.fetch = async (_url, init) =>
    init?.method === "POST"
      ? Response.json({ error: "Try saving later." }, { status: 503 })
      : Response.json(null);
  await mount(createElement(ReviewButton, { item: movie }));
  await click("Write a review");
  await waitFor(() => assert.ok(document.querySelector("textarea")));
  document.querySelector("textarea")!.value = "Unsaved draft";
  await click("Cancel");
  await click("Write a review");
  await waitFor(() =>
    assert.equal(document.querySelector("textarea")?.value, ""),
  );
  document.querySelector("textarea")!.value = "Keep this draft";
  await click("Publish review");
  await waitFor(() =>
    assert.match(
      document.querySelector('[role="alert"]')?.textContent ?? "",
      /Try saving later/,
    ),
  );
  assert.equal(document.querySelector("textarea")!.value, "Keep this draft");
  assert.equal(document.querySelector("dialog")?.open, true);
});

test("watchlist controls filter titles, separate card actions, and restore a failed removal", async () => {
  const saved = [
    {
      id: 603,
      kind: "watchlist" as const,
      mediaType: "movie" as const,
      title: "The Matrix",
      poster: null,
      rating: 8,
    },
    {
      id: 603,
      kind: "watchlist" as const,
      mediaType: "tv" as const,
      title: "The Show",
      poster: null,
      rating: 9,
    },
  ];
  _resetForTest(saved);
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  await mount(createElement(Favorites, { kind: "watchlist" }));
  assert.equal(document.querySelectorAll("li").length, 2);
  assert.equal(
    document.querySelector("a button"),
    null,
    "actions must not be nested in links",
  );
  button("Log watch for The Matrix");
  assert.equal(
    document
      .querySelector('a[aria-label="Track episodes of The Show"]')
      ?.getAttribute("href"),
    "/tv?id=603",
  );
  const type = document.querySelector("select")!;
  await act(async () => {
    type.value = "movie";
    type.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  assert.equal(document.querySelectorAll("li").length, 1);
  await click("Clear filters");
  assert.equal(document.querySelectorAll("li").length, 2);
  const search = document.querySelector('input[type="search"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      "value",
    )!.set!.call(search, "no matches");
    search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  assert.equal(document.querySelectorAll("li").length, 0);
  assert.match(document.body.textContent ?? "", /No saved titles match/);
  await click("Clear filters");
  const remove = [...document.querySelectorAll("button")].find((item) =>
    item.textContent?.includes("Remove"),
  )!;
  await act(async () => remove.click());
  await waitFor(() => assert.equal(document.querySelectorAll("li").length, 2));
  assert.equal(getFavorites().length, 2);
});

test("logging from the watchlist keeps failed saves and removes only the successfully logged movie", async () => {
  _resetForTest([
    {
      id: 603,
      kind: "watchlist",
      mediaType: "movie",
      title: "The Matrix",
      poster: null,
    },
    {
      id: 603,
      kind: "watchlist",
      mediaType: "tv",
      title: "The Show",
      poster: null,
    },
  ]);
  let fail = true;
  let entry: Record<string, unknown> | undefined;
  globalThis.fetch = async (url, init) => {
    if (url === "/api/watched" && init?.method === "POST") {
      entry = JSON.parse(String(init.body));
      return fail
        ? Response.json({ error: "Could not save log." }, { status: 503 })
        : Response.json({ id: 10 });
    }
    assert.equal(
      String(url),
      "/api/favorites?tmdbId=603&mediaType=movie&kind=watchlist",
    );
    assert.equal(init?.method, "DELETE");
    return Response.json({ ok: true });
  };
  await mount(createElement(Favorites, { kind: "watchlist" }));
  await click("Log watch for The Matrix");
  await click("Save log");
  await waitFor(() =>
    assert.match(
      document.querySelector('[role="alert"]')?.textContent ?? "",
      /Could not save log/,
    ),
  );
  assert.equal(getFavorites().length, 2);
  fail = false;
  await click("Save log");
  await waitFor(() => assert.equal(document.querySelectorAll("li").length, 1));
  assert.equal(entry?.tmdbId, 603);
  assert.equal(entry?.mediaType, "movie");
  assert.equal(getFavorites()[0].mediaType, "tv");
});
