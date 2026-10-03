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
const auth = {
  token: "test-token" as string | null,
  userId: "test-user" as string | null,
  pending: false,
};
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  localStorage: dom.window.localStorage,
  CustomEvent: dom.window.CustomEvent,
  FormData: dom.window.FormData,
  Node: dom.window.Node,
  HTMLElement: dom.window.HTMLElement,
  getComputedStyle: dom.window.getComputedStyle,
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
  cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
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
          url: `data:text/javascript,${encodeURIComponent("export const getJWTToken = async () => globalThis.__nextWatchUiAuth.token; export const authClient = { useSession: () => { const auth = globalThis.__nextWatchUiAuth; return { data: auth.userId ? { user: { id: auth.userId } } : null, isPending: auth.pending }; } };")}`,
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
const { default: Reviews } = await import("../components/Reviews.tsx");
const { default: Lists } = await import("../components/Lists.tsx");
const { default: AddToListButton } =
  await import("../components/AddToListButton.tsx");
const { default: ListDetail } = await import("../components/ListDetail.tsx");
const { default: Favorites } = await import("../components/Favorites.tsx");
const { default: SeasonDetail } =
  await import("../components/SeasonDetail.tsx");
const { default: EpisodeDetail } =
  await import("../components/EpisodeDetail.tsx");
const { reviewHref } = await import("./reviews.ts");
const { reviewDocumentText } = await import("./reviewDocument.ts");
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
  await render(element);
}
async function render(element: ReactElement) {
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
function editorElement() {
  return document.querySelector<HTMLElement>(
    '[role="textbox"][contenteditable]',
  );
}
async function typeReview(text: string) {
  await act(async () => {
    const editor = editorElement()!;
    editor.replaceChildren(document.createElement("p"));
    editor.firstChild!.textContent = text;
    editor.dispatchEvent(
      new dom.window.InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: text,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
const movie = { tmdbId: 603, mediaType: "movie" as const, title: "The Matrix" };
const review = { ...movie, id: 7, rating: 4, review: "Saved review" };
const episode = {
  id: 9001,
  season_number: 1,
  episode_number: 1,
  name: "Pilot",
  overview: "The story begins.",
  air_date: "2020-01-01",
  runtime: 40,
  still_path: null,
  vote_average: 8,
  vote_count: 10,
  guest_stars: [],
  crew: [],
};
const season = {
  id: 900,
  season_number: 1,
  name: "Season 1",
  overview: "",
  air_date: "2020-01-01",
  episode_count: 2,
  poster_path: null,
  episodes: [
    episode,
    { ...episode, id: 9002, episode_number: 2, name: "Second episode" },
  ],
};
const show = {
  id: 1399,
  name: "Example show",
  first_air_date: "2020-01-01",
  poster_path: null,
  overview: "",
  vote_average: 8,
  backdrop_path: null,
  genres: [],
  episode_run_time: [40],
  number_of_seasons: 1,
  number_of_episodes: 2,
  seasons: [season],
  tagline: "",
  vote_count: 10,
};
afterEach(async () => {
  await act(async () => root?.unmount());
  client?.clear();
  document.body.replaceChildren();
  auth.token = "test-token";
  auth.userId = "test-user";
  auth.pending = false;
  _resetForTest([]);
});
after(() => dom.window.close());

test("season actions save independent favorites, watchlists and rich review drafts", async () => {
  const title = "Example show · Season 1";
  const seriesFavorite = {
    id: show.id,
    mediaType: "tv" as const,
    title: show.name,
    poster: null,
  };
  _resetForTest([
    seriesFavorite,
    { ...seriesFavorite, season: 2, title: "Example show · Season 2" },
  ]);
  const writes: Record<string, unknown>[] = [];
  const ownReview: { value: Record<string, unknown> | null } = { value: null };
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), "https://next-watch.test");
    if (url.pathname === "/api/favorites") {
      if (init?.method === "POST") {
        const entry = JSON.parse(String(init.body));
        assert.equal(entry.tmdbId, show.id);
        assert.equal(entry.season, 1);
        assert.equal(entry.href, `/tv/season?id=${show.id}&season=1`);
        writes.push(entry);
      }
      return Response.json({ ok: true });
    }
    if (url.pathname !== "/api/reviews") return Response.json([]);
    if (init?.method === "POST" || init?.method === "PATCH") {
      const entry = JSON.parse(String(init.body));
      assert.equal(entry.tmdbId, show.id);
      assert.equal(entry.season, 1);
      assert.equal(entry.episode, undefined);
      ownReview.value = {
        ...entry,
        id: 99,
        review: reviewDocumentText(entry.document),
      };
    } else {
      assert.equal(url.searchParams.get("season"), "1");
      assert.equal(url.searchParams.has("episode"), false);
    }
    return Response.json(ownReview.value);
  };
  await mount(
    createElement(SeasonDetail, {
      tvId: show.id,
      seasonNumber: 1,
      initialShow: show,
      initialData: season,
    }),
  );
  const actions = document.querySelector('[aria-label="Season actions"]');
  assert.ok(actions);
  assert.equal(
    button(`Favorite ${title}`).getAttribute("aria-pressed"),
    "false",
  );
  await click(`Favorite ${title}`);
  await waitFor(() =>
    assert.equal(
      button(`Unfavorite ${title}`).getAttribute("aria-pressed"),
      "true",
    ),
  );
  await click(`Add ${title} to watchlist`);
  await waitFor(() =>
    assert.equal(
      button(`Remove ${title} from watchlist`).getAttribute("aria-pressed"),
      "true",
    ),
  );
  assert.equal(getFavorites().length, 4);
  assert.deepEqual(
    writes.map((entry) => entry.kind),
    ["favorite", "watchlist"],
  );
  await click(`Unfavorite ${title}`);
  await waitFor(() => assert.equal(getFavorites().length, 3));
  assert.ok(getFavorites().some((entry) => entry.season == null));
  assert.ok(getFavorites().some((entry) => entry.season === 2));
  assert.ok(
    getFavorites().some(
      (entry) => entry.season === 1 && entry.kind === "watchlist",
    ),
  );
  const reviewAction = [...actions.querySelectorAll("button")].find(
    (element) => element.textContent?.trim() === "Write a review",
  )!;
  await act(async () => reviewAction.click());
  await waitFor(() => assert.ok(editorElement()));
  assert.match(
    document.querySelector("dialog[open]")?.textContent ?? "",
    /Example show · Season 1/,
  );
  await typeReview("This entire season was wonderful");
  await click("Save draft");
  await waitFor(() =>
    assert.equal(document.querySelector("dialog[open]"), null),
  );
  assert.equal(ownReview.value?.status, "draft");
  await act(async () => reviewAction.click());
  await waitFor(() =>
    assert.equal(
      editorElement()?.textContent,
      "This entire season was wonderful",
    ),
  );
  await click("Publish review");
  await waitFor(() =>
    assert.equal(document.querySelector("dialog[open]"), null),
  );
  assert.equal(ownReview.value?.status, "published");
});

test("season watchlist cards link back to their season and remove only that entry", async () => {
  const base = {
    id: show.id,
    mediaType: "tv" as const,
    kind: "watchlist" as const,
    title: show.name,
    poster: null,
  };
  _resetForTest([
    base,
    { ...base, season: 0, title: "Example show · Specials" },
    { ...base, season: 1, title: "Example show · Season 1" },
  ]);
  let deleted = "";
  globalThis.fetch = async (input, init) => {
    if (init?.method === "DELETE") deleted = String(input);
    return Response.json({ ok: true });
  };
  await mount(createElement(Favorites, { kind: "watchlist" }));
  assert.equal(document.querySelectorAll("li").length, 3);
  assert.ok(
    document.querySelector(`a[href="/tv/season?id=${show.id}&season=0"]`),
  );
  assert.ok(
    document.querySelector(`a[href="/tv/season?id=${show.id}&season=1"]`),
  );
  await click("Remove Example show · Season 1 from watchlist");
  await waitFor(() => assert.equal(document.querySelectorAll("li").length, 2));
  assert.match(deleted, /season=1$/);
  assert.equal(getFavorites().filter((entry) => entry.season === 0).length, 1);
  assert.equal(
    getFavorites().filter((entry) => entry.season == null).length,
    1,
  );
});

test("season rows save and reopen separate episode reviews without sharing cached drafts", async () => {
  const saved = new Map<string, Record<string, unknown>>();
  const lookups: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), "https://next-watch.test");
    if (url.pathname !== "/api/reviews") return Response.json([]);
    if (init?.method === "POST" || init?.method === "PATCH") {
      const entry = JSON.parse(String(init.body));
      assert.equal(entry.tmdbId, show.id);
      assert.equal(entry.mediaType, "tv");
      const key = `${entry.season}/${entry.episode}`;
      const row = {
        ...entry,
        id: entry.episode,
        review: reviewDocumentText(entry.document),
      };
      saved.set(key, row);
      return Response.json(row);
    }
    assert.equal(url.searchParams.get("tmdbId"), String(show.id));
    assert.equal(url.searchParams.get("mediaType"), "tv");
    const key = `${url.searchParams.get("season")}/${url.searchParams.get("episode")}`;
    lookups.push(key);
    return Response.json(saved.get(key) ?? null);
  };
  await mount(
    createElement(SeasonDetail, {
      tvId: show.id,
      seasonNumber: 1,
      initialShow: show,
      initialData: season,
    }),
  );
  const reviewButtons = [
    ...document.querySelectorAll<HTMLButtonElement>("li button"),
  ].filter((element) => element.textContent?.trim() === "Write a review");
  assert.equal(reviewButtons.length, 2);
  await act(async () => reviewButtons[0].click());
  await waitFor(() => assert.ok(editorElement()));
  assert.match(
    document.querySelector("dialog[open]")?.textContent ?? "",
    /Example show S01E01/,
  );
  await typeReview("The pilot is wonderful");
  await click("Save draft");
  await waitFor(() =>
    assert.equal(document.querySelector("dialog[open]"), null),
  );
  assert.equal(saved.get("1/1")?.status, "draft");
  await act(async () => reviewButtons[1].click());
  await waitFor(() => assert.ok(editorElement()));
  assert.equal(editorElement()?.textContent, "");
  await typeReview("The second episode is even better");
  await click("Publish review");
  await waitFor(() =>
    assert.equal(document.querySelector("dialog[open]"), null),
  );
  assert.equal(saved.get("1/2")?.status, "published");
  await act(async () => reviewButtons[0].click());
  await waitFor(() =>
    assert.equal(editorElement()?.textContent, "The pilot is wonderful"),
  );
  await click("Publish review");
  await waitFor(() =>
    assert.equal(document.querySelector("dialog[open]"), null),
  );
  assert.equal(saved.get("1/1")?.status, "published");
  assert.equal(saved.get("1/2")?.review, "The second episode is even better");
  // Saving invalidates the active query, so duplicate lookups are expected.
  assert.deepEqual(new Set(lookups), new Set(["1/1", "1/2"]));
});

test("episode detail edits its own review and preserves it after a failed save", async () => {
  const ownReview = {
    ...review,
    tmdbId: show.id,
    mediaType: "tv",
    season: 1,
    episode: 1,
  };
  const writes: Record<string, unknown>[] = [];
  let failSave = true;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), "https://next-watch.test");
    if (url.pathname !== "/api/reviews") return Response.json([]);
    if (init?.method === "PATCH") {
      assert.equal(url.searchParams.get("id"), "7");
      writes.push(JSON.parse(String(init.body)));
      if (failSave)
        return Response.json(
          { error: "Could not save episode review" },
          { status: 503 },
        );
    } else {
      assert.equal(url.searchParams.get("season"), "1");
      assert.equal(url.searchParams.get("episode"), "1");
    }
    return Response.json(ownReview);
  };
  await mount(
    createElement(EpisodeDetail, {
      tvId: show.id,
      seasonNumber: 1,
      episodeNumber: 1,
      initialShow: show,
      initialData: episode,
    }),
  );
  await click("Write a review");
  await waitFor(() =>
    assert.equal(editorElement()?.textContent, "Saved review"),
  );
  await typeReview("Updated episode review");
  await click("Update review");
  await waitFor(() =>
    assert.match(
      document.querySelector('[role="alert"]')?.textContent ?? "",
      /Could not save episode review/,
    ),
  );
  assert.equal(editorElement()?.textContent, "Updated episode review");
  failSave = false;
  await click("Update review");
  await waitFor(() =>
    assert.equal(document.querySelector("dialog[open]"), null),
  );
  assert.equal(writes[1].tmdbId, show.id);
  assert.equal(writes[1].season, 1);
  assert.equal(writes[1].episode, 1);
});

test("the review library links specials to their episode and resumes the correct draft", async () => {
  const draft = {
    ...review,
    tmdbId: show.id,
    mediaType: "tv" as const,
    season: 0,
    episode: 1,
    status: "draft",
    title: "Example show S00E01",
    subtitle: "Special",
    updatedAt: "2026-10-02T00:00:00Z",
  };
  assert.equal(reviewHref(movie), "/movie?id=603");
  assert.equal(
    reviewHref({ tmdbId: show.id, mediaType: "tv" }),
    `/tv?id=${show.id}`,
  );
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), "https://next-watch.test");
    if (url.searchParams.has("tmdbId")) {
      assert.equal(url.searchParams.get("season"), "0");
      assert.equal(url.searchParams.get("episode"), "1");
      return Response.json(draft);
    }
    return Response.json([draft]);
  };
  await mount(createElement(Reviews));
  await waitFor(() => assert.ok(document.querySelector("article")));
  assert.match(
    document.querySelector("article")?.textContent ?? "",
    /TV episode/,
  );
  assert.equal(
    document.querySelector("article h2 a")?.getAttribute("href"),
    `/tv/episode?id=${show.id}&season=0&episode=1`,
  );
  await click("Continue writing");
  await waitFor(() =>
    assert.equal(editorElement()?.textContent, "Saved review"),
  );
});

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
    assert.equal(editorElement()?.textContent, "Saved review"),
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
  await typeReview("Updated review");
  await click("Update review");
  await waitFor(() =>
    assert.equal(document.querySelector("dialog")?.open, false),
  );
  assert.equal(request?.method, "PATCH");
  assert.equal(
    JSON.parse(String(request?.body)).document.content[0].content[0].text,
    "Updated review",
  );
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
  await waitFor(() => assert.ok(editorElement()));
  await typeReview("Unsaved draft");
  await click("Cancel");
  await click("Write a review");
  await waitFor(() => assert.equal(editorElement()?.textContent, ""));
  await typeReview("Keep this draft");
  await click("Publish review");
  await waitFor(() =>
    assert.match(
      document.querySelector('[role="alert"]')?.textContent ?? "",
      /Try saving later/,
    ),
  );
  assert.equal(editorElement()!.textContent, "Keep this draft");
  assert.equal(document.querySelector("dialog")?.open, true);
});

test("a rich draft survives saving, reopening and publishing without losing formatting", async () => {
  const saved: { value: Record<string, unknown> | null } = { value: null };
  let failSave = true;
  const richDocument = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "A bold opinion", marks: [{ type: "bold" }] },
        ],
      },
    ],
  };
  globalThis.fetch = async (_url, init) => {
    if (init?.method === "POST" || init?.method === "PATCH") {
      if (failSave)
        return Response.json(
          { error: "Draft could not be saved." },
          { status: 503 },
        );
      const entry = JSON.parse(String(init.body));
      saved.value = {
        ...movie,
        id: 7,
        ...entry,
        review: "A bold opinion",
        document: entry.document,
        updatedAt: "2026-10-02T00:00:00Z",
      };
    }
    return Response.json(saved.value);
  };
  await mount(createElement(ReviewButton, { item: movie }));
  await click("Write a review");
  await waitFor(() => assert.ok(editorElement()));
  await typeReview("An unfinished thought");
  await click("Save draft");
  await waitFor(() =>
    assert.match(
      document.querySelector('[role="alert"]')?.textContent ?? "",
      /Draft could not/,
    ),
  );
  assert.equal(editorElement()?.textContent, "An unfinished thought");
  assert.equal(document.querySelector("dialog")?.open, true);
  failSave = false;
  await click("Save draft");
  await waitFor(() =>
    assert.equal(document.querySelector("dialog")?.open, false),
  );
  assert.equal(saved.value!.status, "draft");
  saved.value = Object.assign({}, saved.value, {
    document: richDocument,
    review: "A bold opinion",
  });
  client.clear();
  await click("Write a review");
  await waitFor(() =>
    assert.equal(
      editorElement()?.querySelector("strong")?.textContent,
      "A bold opinion",
    ),
  );
  await click("Publish review");
  await waitFor(() =>
    assert.equal(document.querySelector("dialog")?.open, false),
  );
  assert.equal(saved.value!.status, "published");
  assert.deepEqual(saved.value!.document, richDocument);
});

test("reviews page filters drafts, paginates all entries, resumes and removes a draft", async () => {
  const makeReview = (id: number, status: string) => ({
    ...movie,
    tmdbId: id,
    id,
    status,
    title: `Review ${id}`,
    review: "Some thoughts",
    updatedAt: "2026-10-02T00:00:00Z",
  });
  let entries = Array.from({ length: 31 }, (_, index) =>
    makeReview(index + 1, index === 30 ? "draft" : "published"),
  );
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), "https://next-watch.test");
    if (init?.method === "DELETE") {
      entries = entries.filter(
        (entry) => entry.id !== Number(url.searchParams.get("id")),
      );
      return Response.json({ ok: true });
    }
    if (url.searchParams.has("tmdbId"))
      return Response.json(
        entries.find(
          (entry) => entry.tmdbId === Number(url.searchParams.get("tmdbId")),
        ) ?? null,
      );
    const status = url.searchParams.get("status");
    const filtered = entries.filter(
      (entry) => status === "all" || entry.status === status,
    );
    const offset = Number(url.searchParams.get("offset"));
    return Response.json(filtered.slice(offset, offset + 30));
  };
  await mount(createElement(Reviews));
  await waitFor(() =>
    assert.equal(document.querySelectorAll("article").length, 30),
  );
  await click("Load more reviews");
  await waitFor(() =>
    assert.equal(document.querySelectorAll("article").length, 31),
  );
  await click("Drafts");
  await waitFor(() =>
    assert.equal(document.querySelectorAll("article").length, 1),
  );
  assert.match(
    document.querySelector("article")?.textContent ?? "",
    /Private draft/,
  );
  await click("Continue writing");
  await waitFor(() =>
    assert.equal(editorElement()?.textContent, "Some thoughts"),
  );
  await click("Delete");
  await waitFor(() =>
    assert.match(document.body.textContent ?? "", /No unfinished reviews/),
  );
  await click("Published");
  await waitFor(() =>
    assert.equal(document.querySelectorAll("article").length, 30),
  );
});

test("reviews page reports a load failure and recovers through retry", async () => {
  let fail = true;
  globalThis.fetch = async () =>
    fail
      ? Response.json({ error: "Reviews are unavailable." }, { status: 503 })
      : Response.json([]);
  await mount(createElement(Reviews));
  await waitFor(() =>
    assert.match(
      document.querySelector('[role="alert"]')?.textContent ?? "",
      /Reviews are unavailable/,
    ),
  );
  fail = false;
  await click("Retry");
  await waitFor(() =>
    assert.match(
      document.body.textContent ?? "",
      /Your next review starts here/,
    ),
  );
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

test("reviews keep one loading layout from pending auth through the first request and render cached revisits immediately", async () => {
  let resolveReviews!: (response: Response) => void;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return new Promise<Response>((resolve) => {
      resolveReviews = resolve;
    });
  };
  auth.userId = null;
  auth.pending = true;
  await mount(createElement(Reviews));
  const loadingLayout = document.querySelector("main")!.innerHTML;
  assert.equal(document.querySelector("h1")?.textContent, "Reviews");
  assert.ok(document.querySelector('[aria-label="Loading your reviews"]'));
  assert.equal(document.querySelector('ul[aria-hidden="true"]'), null);
  assert.equal(requests, 0);

  auth.userId = "test-user";
  auth.pending = false;
  await render(createElement(Reviews));
  // Auth resolution only enables the filters; the rest of the loading
  // markup remains identical until the reviews arrive.
  assert.equal(document.querySelector("h1")?.textContent, "Reviews");
  assert.ok(document.querySelector('[aria-label="Loading your reviews"]'));
  assert.equal(document.querySelector('ul[aria-hidden="true"]'), null);
  assert.equal(
    document.querySelector("main")!.innerHTML,
    loadingLayout.replaceAll(' disabled=""', ""),
  );
  await waitFor(() => assert.equal(requests, 1));
  await act(async () =>
    resolveReviews(
      Response.json([
        { ...review, status: "published", updatedAt: "2026-10-02T00:00:00Z" },
      ]),
    ),
  );
  await waitFor(() => assert.ok(document.querySelector("article")));
  await render(createElement("div", null, "Another tab"));
  await render(createElement(Reviews));
  assert.ok(document.querySelector("article"));
  assert.equal(
    document.querySelector('[aria-label="Loading your reviews"]'),
    null,
  );
  assert.equal(requests, 1);
});

test("reviews retain rows during slow filters, retry failures, and never carry placeholders across accounts", async () => {
  const published = {
    ...review,
    status: "published",
    updatedAt: "2026-10-02T00:00:00Z",
  };
  let resolveDrafts!: (response: Response) => void;
  let fail = true;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), "https://next-watch.test");
    if (url.searchParams.get("status") === "draft")
      return new Promise<Response>((resolve) => {
        resolveDrafts = resolve;
      });
    if (url.searchParams.get("status") === "published" && fail)
      return Response.json({ error: "Reviews unavailable" }, { status: 503 });
    return Response.json([published]);
  };
  await mount(createElement(Reviews));
  await waitFor(() => assert.ok(document.querySelector("article")));
  const original = document.querySelector("article");
  await click("Drafts");
  assert.equal(document.querySelector("article"), original);
  assert.ok(document.querySelector('ul[aria-busy="true"]'));
  assert.equal(
    document.querySelector('[aria-label="Loading your reviews"]'),
    null,
  );
  assert.match(
    document.querySelector('[role="status"]')?.textContent ?? "",
    /Updating reviews/,
  );
  await act(async () => resolveDrafts(Response.json([])));
  await waitFor(() =>
    assert.match(
      document.querySelector("h2")?.textContent ?? "",
      /No unfinished reviews/,
    ),
  );
  await click("All reviews");
  assert.ok(document.querySelector("article"));
  await click("Published");
  await waitFor(() =>
    assert.match(
      document.querySelector('[role="alert"]')?.textContent ?? "",
      /Reviews unavailable/,
    ),
  );
  fail = false;
  await click("Retry");
  await waitFor(() => assert.ok(document.querySelector("article")));

  globalThis.fetch = async () => new Promise<Response>(() => {});
  auth.userId = "another-user";
  await render(createElement(Reviews));
  assert.equal(document.querySelector("article"), null);
  assert.ok(document.querySelector('[aria-label="Loading your reviews"]'));
});

const listId = "11111111-1111-4111-8111-111111111111";
const listSummary = {
  id: listId,
  title: "Weekend picks",
  description: "For a rainy day",
  shared: false,
  itemCount: 1,
};
const listTitle = {
  tmdbId: 42,
  mediaType: "movie" as const,
  title: "Example movie",
  poster: null,
};

function listFormValue(name: string, value: string) {
  const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `form [name="${name}"]`,
  );
  assert.ok(input);
  input.value = value;
}
async function submitListForm() {
  const form = document.querySelector("form");
  assert.ok(form);
  await act(async () => {
    form.dispatchEvent(
      new dom.window.Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}

test("add-to-list retries load and save failures, and closes only after a successful add", async () => {
  let loadFails = true,
    saveFails = true;
  const writes: any[] = [];
  globalThis.fetch = async (_input, init) => {
    if (init?.method === "POST") {
      writes.push(JSON.parse(String(init.body)));
      return saveFails
        ? Response.json({ error: "Could not add title" }, { status: 503 })
        : Response.json({ ok: true });
    }
    return loadFails
      ? Response.json({ error: "Lists unavailable" }, { status: 503 })
      : Response.json([listSummary]);
  };
  await mount(createElement(AddToListButton, { item: listTitle }));
  await click("Add to list");
  await waitFor(() =>
    assert.match(
      document.querySelector('[role="alert"]')?.textContent ?? "",
      /Lists unavailable/,
    ),
  );
  assert.ok(document.querySelector("dialog[open]"));
  loadFails = false;
  await click("Retry");
  await waitFor(() =>
    assert.match(document.body.textContent ?? "", /Weekend picks/),
  );
  const pick = async () => {
    await act(async () => {
      const target = [...document.querySelectorAll("dialog button")].find(
        (button) => button.textContent?.includes("Weekend picks"),
      ) as HTMLButtonElement;
      assert.ok(target);
      target.click();
    });
  };
  await pick();
  await waitFor(() =>
    assert.match(
      document.querySelector('[role="alert"]')?.textContent ?? "",
      /Could not add title/,
    ),
  );
  assert.ok(document.querySelector("dialog[open]"));
  saveFails = false;
  await pick();
  await waitFor(() =>
    assert.equal(document.querySelector("dialog[open]"), null),
  );
  assert.deepEqual(writes.at(-1), {
    action: "add",
    id: listId,
    item: listTitle,
  });
});

test("creating a list while adding preserves failed drafts and discards cancelled drafts", async () => {
  let fail = true;
  let payload: any;
  globalThis.fetch = async (_input, init) => {
    if (init?.method === "POST") {
      payload = JSON.parse(String(init.body));
      return fail
        ? Response.json({ error: "Try saving again" }, { status: 503 })
        : Response.json({ id: listId });
    }
    return Response.json([]);
  };
  await mount(createElement(AddToListButton, { item: listTitle }));
  await click("Add to list");
  await click("Create a new list");
  listFormValue("title", "October horror");
  listFormValue("description", "Bring popcorn");
  assert.equal(
    document.querySelector<HTMLInputElement>('[name="shared"]')?.checked,
    false,
  );
  await submitListForm();
  await waitFor(() =>
    assert.match(
      document.querySelector('[role="alert"]')?.textContent ?? "",
      /Try saving again/,
    ),
  );
  assert.equal(
    document.querySelector<HTMLInputElement>('[name="title"]')?.value,
    "October horror",
  );
  await click("Close list dialog");
  await click("Add to list");
  await click("Create a new list");
  assert.equal(
    document.querySelector<HTMLInputElement>('[name="title"]')?.value,
    "",
  );
  listFormValue("title", "Fresh list");
  fail = false;
  await submitListForm();
  await waitFor(() =>
    assert.equal(document.querySelector("dialog[open]"), null),
  );
  assert.equal(payload.shared, false);
  assert.equal(payload.title, "Fresh list");
  assert.deepEqual(payload.item, listTitle);
});

test("a completed save from a closed list dialog does not dismiss a new draft", async () => {
  let finishSave!: (response: Response) => void;
  globalThis.fetch = async (_input, init) =>
    init?.method === "POST"
      ? new Promise<Response>((resolve) => {
          finishSave = resolve;
        })
      : Response.json([]);
  await mount(createElement(AddToListButton, { item: listTitle }));
  await click("Add to list");
  await click("Create a new list");
  listFormValue("title", "First list");
  await submitListForm();
  await click("Close list dialog");
  await click("Add to list");
  await click("Create a new list");
  listFormValue("title", "Second draft");
  await act(async () => {
    finishSave(Response.json({ id: listId }));
  });
  await waitFor(() => {
    assert.ok(document.querySelector("dialog[open]"));
    assert.equal(
      document.querySelector<HTMLInputElement>('[name="title"]')?.value,
      "Second draft",
    );
  });
});

test("list library creates private lists and isolates cached lists across accounts", async () => {
  let created = false;
  let payload: any;
  globalThis.fetch = async (_input, init) => {
    if (init?.method === "POST") {
      payload = JSON.parse(String(init.body));
      created = true;
      return Response.json({ id: listId });
    }
    return Response.json(created ? [listSummary] : []);
  };
  await mount(createElement(Lists));
  await waitFor(() =>
    assert.match(
      document.body.textContent ?? "",
      /Make room for your next obsession/,
    ),
  );
  await click("Create list");
  listFormValue("title", "Weekend picks");
  await submitListForm();
  await waitFor(() =>
    assert.ok(document.querySelector(`a[href="/lists/${listId}"]`)),
  );
  assert.equal(payload.shared, false);
  assert.equal(payload.action, "create");
  globalThis.fetch = async () => new Promise<Response>(() => {});
  auth.userId = "other-user";
  await render(createElement(Lists));
  assert.doesNotMatch(document.body.textContent ?? "", /Weekend picks/);
  assert.match(document.body.textContent ?? "", /Loading your lists/);
});

test("shared lists render signed out without edit controls and hide content after access is revoked", async () => {
  auth.userId = null;
  auth.token = null;
  let revoked = false;
  globalThis.fetch = async (_input, init) => {
    assert.equal(new Headers(init?.headers).has("authorization"), false);
    return revoked
      ? Response.json(
          { error: "This list is private or no longer available." },
          { status: 404 },
        )
      : Response.json({
          ...listSummary,
          shared: true,
          isOwner: false,
          ownerName: "A friend",
          items: [{ ...listTitle, id: 1 }],
        });
  };
  await mount(createElement(ListDetail, { id: listId }));
  await waitFor(() =>
    assert.match(
      document.querySelector("h1")?.textContent ?? "",
      /Weekend picks/,
    ),
  );
  assert.ok(document.querySelector('a[href="/movie?id=42"]'));
  assert.doesNotMatch(
    document.body.textContent ?? "",
    /Edit list|Delete list|Remove/,
  );
  await click("Copy share link");
  assert.equal(
    document.querySelector<HTMLInputElement>("input[readonly]")?.value,
    `https://next-watch.test/lists/${listId}`,
  );
  revoked = true;
  await act(async () => {
    await client.invalidateQueries({ queryKey: ["lists"] });
  });
  await waitFor(() =>
    assert.match(
      document.querySelector('[role="alert"]')?.textContent ?? "",
      /private or no longer/,
    ),
  );
  assert.doesNotMatch(
    document.body.textContent ?? "",
    /Weekend picks|Example movie/,
  );
});

test("list owners can edit sharing and remove titles with retryable failures", async () => {
  let list = {
    ...listSummary,
    isOwner: true,
    ownerName: "You",
    items: [{ ...listTitle, id: 1 }],
  };
  let fail = true;
  let deletes = 0;
  globalThis.fetch = async (_input, init) => {
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      if (fail)
        return Response.json(
          { error: "Changes were not saved" },
          { status: 503 },
        );
      if (body.action === "update")
        list = {
          ...list,
          title: body.title,
          description: body.description,
          shared: body.shared,
        };
      if (body.action === "remove") list = { ...list, items: [] };
      if (body.action === "delete") deletes++;
      return Response.json({ ok: true });
    }
    return Response.json(list);
  };
  await mount(createElement(ListDetail, { id: listId }));
  await waitFor(() =>
    assert.match(
      document.querySelector("h1")?.textContent ?? "",
      /Weekend picks/,
    ),
  );
  await click("Edit list");
  listFormValue("title", "Renamed list");
  document.querySelector<HTMLInputElement>('[name="shared"]')!.checked = true;
  await submitListForm();
  await waitFor(() =>
    assert.match(
      document.querySelector('[role="alert"]')?.textContent ?? "",
      /not saved/,
    ),
  );
  assert.equal(
    document.querySelector<HTMLInputElement>('[name="title"]')?.value,
    "Renamed list",
  );
  fail = false;
  await submitListForm();
  await waitFor(() => assert.equal(document.querySelector("form"), null));
  assert.match(document.querySelector("h1")?.textContent ?? "", /Renamed list/);
  assert.ok(button("Copy share link"));
  fail = true;
  await click("Remove Example movie from list");
  await waitFor(() =>
    assert.match(
      document.querySelector('[role="alert"]')?.textContent ?? "",
      /not saved/,
    ),
  );
  assert.ok(document.querySelector('a[href="/movie?id=42"]'));
  fail = false;
  await click("Remove Example movie from list");
  await waitFor(() =>
    assert.equal(document.querySelector('a[href="/movie?id=42"]'), null),
  );
  await click("Delete list");
  await click("Cancel");
  assert.equal(deletes, 0);
  await click("Delete list");
  await click("Delete permanently");
  await waitFor(() =>
    assert.match(
      document.querySelector("h1")?.textContent ?? "",
      /List deleted/,
    ),
  );
  assert.equal(deletes, 1);
});
