import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { after, afterEach, test } from "node:test";
import { JSDOM } from "jsdom";
import ts from "typescript";
import { act, createElement, type ReactElement } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://next-watch.test/search?q=Arrival",
});
const navigations: string[] = [];
// JSDOM has no layout or scrolling; exercise actual scrolling in the browser.
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
  __navigationUiNavigate: (href: string) => navigations.push(href),
});
const sourceRoot = new URL("../", import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.startsWith(sourceRoot)) {
      if (specifier === "astro:transitions/client")
        return {
          url: "data:text/javascript,export const navigate = globalThis.__navigationUiNavigate;",
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
    if (url.startsWith(sourceRoot) && /\.tsx?$/.test(url))
      return {
        format: "module",
        source: ts
          .transpileModule(readFileSync(new URL(url), "utf8"), {
            fileName: url,
            compilerOptions: {
              jsx: ts.JsxEmit.ReactJSX,
              module: ts.ModuleKind.ESNext,
              target: ts.ScriptTarget.ES2022,
            },
          })
          .outputText.replaceAll("import.meta.env.SSR", "false"),
        shortCircuit: true,
      };
    return next(url, context);
  },
});
const { createRoot } = await import("react-dom/client");
const { default: Search } = await import("../components/Search.tsx");
const { SearchBox } = await import("../components/SearchBox.tsx");
const { default: QueryProvider } =
  await import("../components/QueryProvider.tsx");
let root: ReturnType<typeof createRoot> | undefined;
let client: QueryClient;
const originalFetch = globalThis.fetch;
function CaptureClient() {
  client = useQueryClient();
  client.setDefaultOptions({
    queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
  });
  return null;
}
async function render(element: ReactElement) {
  root ??= createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () =>
    root!.render(
      createElement(QueryProvider, null, createElement(CaptureClient), element),
    ),
  );
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
const movie = {
  id: 1,
  title: "Arrival",
  media_type: "movie",
  release_date: "2016-01-01",
  poster_path: "/arrival.jpg",
  vote_average: 8,
};
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  client?.clear();
  document.body.replaceChildren();
  navigations.length = 0;
  globalThis.fetch = originalFetch;
});
after(() => dom.window.close());

test("search keeps the current results during a slow tab request and reuses cached tabs", async () => {
  let resolveTv!: (response: Response) => void;
  let requests = 0;
  globalThis.fetch = async (input) => {
    requests++;
    return String(input).includes("%2Ftv")
      ? new Promise<Response>((resolve) => {
          resolveTv = resolve;
        })
      : Response.json({ results: [movie], total_pages: 2 });
  };
  await render(
    createElement(Search, { initialQuery: "Arrival", initialTab: "all" }),
  );
  await waitFor(() =>
    assert.ok(document.querySelector('a[href="/movie?id=1"]')),
  );
  const originalCard = document.querySelector('a[href="/movie?id=1"]');
  await render(
    createElement(Search, { initialQuery: "Arrival", initialTab: "tv" }),
  );
  assert.equal(document.querySelector('a[href="/movie?id=1"]'), originalCard);
  assert.ok(document.querySelector('ul[aria-busy="true"]'));
  assert.match(
    document.querySelector('[role="status"]')!.textContent!,
    /Updating/,
  );
  await act(async () =>
    resolveTv(
      Response.json({
        results: [
          {
            id: 2,
            name: "Arrival TV",
            first_air_date: "2020",
            media_type: "tv",
            poster_path: null,
          },
        ],
        total_pages: 1,
      }),
    ),
  );
  await waitFor(() => assert.ok(document.querySelector('a[href="/tv?id=2"]')));
  await render(
    createElement(Search, { initialQuery: "Arrival", initialTab: "all" }),
  );
  assert.ok(document.querySelector('a[href="/movie?id=1"]'));
  assert.equal(
    requests,
    2,
    "returning to a fresh cached tab should not fetch again",
  );
});

test("failed searches show an error, stop loading, and recover through retry", async () => {
  globalThis.fetch = async () => new Response(null, { status: 503 });
  await render(
    createElement(Search, { initialQuery: "Arrival", initialTab: "movie" }),
  );
  await waitFor(() =>
    assert.match(document.body.textContent!, /Something went wrong/),
  );
  assert.equal(document.querySelector('[role="status"]')!.textContent, "");
  assert.equal(document.querySelector('ul[aria-busy="true"]'), null);
  globalThis.fetch = async () => Response.json({ results: [movie] });
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[role="alert"] button')!.click(),
  );
  await waitFor(() =>
    assert.ok(document.querySelector('a[href="/movie?id=1"]')),
  );
  assert.equal(document.querySelector('[role="alert"]'), null);
});

test("clearing a persisted search removes old results", async () => {
  globalThis.fetch = async (input) =>
    Response.json({ results: String(input).includes("search") ? [movie] : [] });
  await render(createElement(Search, { initialQuery: "Arrival" }));
  await waitFor(() =>
    assert.ok(document.querySelector('a[href="/movie?id=1"]')),
  );
  await render(createElement(Search, { initialQuery: "" }));
  assert.equal(document.querySelector('a[href="/movie?id=1"]'), null);
  assert.equal(
    document.querySelector<HTMLInputElement>('[name="q"]')!.value,
    "",
  );
});

test("keyboard suggestions navigate without reloading and close afterward", async () => {
  globalThis.fetch = async (input) =>
    Response.json(
      String(input).startsWith("/api/users") ? [] : { results: [movie] },
    );
  await render(
    createElement(SearchBox, { initialQuery: "Arrival", compact: true }),
  );
  const input = document.querySelector<HTMLInputElement>('[name="q"]')!;
  await act(async () => input.focus());
  await waitFor(() => assert.ok(document.querySelector('[role="option"]')));
  await act(async () => {
    input.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
      }),
    );
  });
  await act(async () => {
    input.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  assert.deepEqual(navigations, ["/movie?id=1"]);
  assert.equal(document.querySelector('[role="listbox"]'), null);
});

test("search submissions use client navigation and synchronize restored query props", async () => {
  await render(
    createElement(SearchBox, { initialQuery: "Arrival", tab: "movie" }),
  );
  await act(async () => {
    document
      .querySelector("form")!
      .dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
  });
  assert.deepEqual(navigations, ["/search?q=Arrival&tab=movie"]);
  await render(
    createElement(SearchBox, { initialQuery: "Dune", tab: "movie" }),
  );
  assert.equal(
    document.querySelector<HTMLInputElement>('[name="q"]')!.value,
    "Dune",
  );
});
