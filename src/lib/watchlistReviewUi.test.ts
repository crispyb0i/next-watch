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
const redirects: string[] = [];
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  location: { replace: (href: string) => redirects.push(href) },
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
      if (specifier.endsWith(".module.css"))
        return {
          url: `data:text/javascript,${encodeURIComponent("export default new Proxy({}, { get: (_, name) => name });")}`,
          shortCircuit: true,
        };
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
    if (
      url.startsWith(sourceRoot) &&
      (url.endsWith(".tsx") || url.endsWith("/lib/tmdb.ts"))
    )
      return {
        format: "module",
        source: ts.transpileModule(
          (url.endsWith("/lib/tmdb.ts")
            ? "import.meta.env = { SSR: false };\n"
            : "") + readFileSync(new URL(url), "utf8"),
          {
            fileName: url,
            compilerOptions: {
              jsx: ts.JsxEmit.ReactJSX,
              module: ts.ModuleKind.ESNext,
              target: ts.ScriptTarget.ES2022,
            },
          },
        ).outputText,
        shortCircuit: true,
      };
    return next(url, context);
  },
});

const { createRoot } = await import("react-dom/client");
const { default: ReviewButton } =
  await import("../components/ReviewButton.tsx");
const { default: Reviews } = await import("../components/Reviews.tsx");
const { default: Watched } = await import("../components/Watched.tsx");
const { default: Lists } = await import("../components/Lists.tsx");
const { default: AddToListButton } =
  await import("../components/AddToListButton.tsx");
const { default: ListDetail } = await import("../components/ListDetail.tsx");
const { default: Favorites } = await import("../components/Favorites.tsx");
const { default: CurrentlyWatching } =
  await import("../components/CurrentlyWatching.tsx");
const { default: Home } = await import("../components/Home.tsx");
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
const review = {
  ...movie,
  id: 7,
  userId: "test-user",
  rating: 4,
  review: "Saved review",
};
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
  redirects.length = 0;
  _resetForTest([]);
});
after(() => dom.window.close());

test("currently watching finds the next episode, logs it, catches up and supports undo", async () => {
  let entries = [{ season: 1, episode: 1 }];
  let failSave = true;
  let failUndo = true;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === "/api/viewing-status")
      return Response.json([
        {
          tmdbId: 1399,
          status: "watching",
          title: show.name,
          poster: null,
          updatedAt: "2025-01-01",
        },
      ]);
    if (url.startsWith("/api/progress")) return Response.json(entries);
    if (url === "/api/watched" && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      assert.equal(body.season, 1);
      assert.equal(body.episode, 2);
      if (failSave)
        return Response.json(
          { error: "Could not save watch." },
          { status: 503 },
        );
      entries = [...entries, { season: 1, episode: 2 }];
      return Response.json({ ...body, id: 777 });
    }
    if (url === "/api/watched?id=777" && init?.method === "DELETE") {
      if (failUndo) return Response.json({}, { status: 503 });
      entries = [{ season: 1, episode: 1 }];
      return Response.json({ ok: true });
    }
    const path = new URL(url, "https://app.invalid").searchParams.get("path");
    if (path === "/tv/1399") return Response.json(show);
    if (path === "/tv/1399/season/1") return Response.json(season);
    throw new Error(`Unexpected request ${url}`);
  };
  await mount(createElement(CurrentlyWatching));
  await waitFor(() => assert.ok(button("Mark S01E02 watched")));
  const progressBar = document.querySelector('[role="progressbar"]');
  assert.equal(progressBar?.getAttribute("aria-valuenow"), "1");
  assert.equal(progressBar?.getAttribute("aria-valuemax"), "2");
  assert.equal(
    progressBar?.getAttribute("aria-label"),
    `${show.name} season progress`,
  );
  assert.match(
    document.body.textContent ?? "",
    /1 of 2 aired episodes watched/,
  );
  assert.ok(
    document.querySelector('a[href="/tv/episode?id=1399&season=1&episode=2"]'),
  );
  await click("Mark S01E02 watched");
  await waitFor(() =>
    assert.match(document.body.textContent ?? "", /Could not save watch/),
  );
  assert.equal(entries.length, 1);
  failSave = false;
  await click("Mark S01E02 watched");
  await waitFor(() =>
    assert.match(
      document.body.textContent ?? "",
      /You’ve watched every aired episode/,
    ),
  );
  assert.equal(
    document.querySelector("select")?.value,
    "watching",
    "caught up never overwrites a personal viewing status",
  );
  await click("Undo");
  await waitFor(() =>
    assert.match(document.body.textContent ?? "", /Could not undo this watch/),
  );
  failUndo = false;
  await click("Undo");
  await waitFor(() => assert.ok(button("Mark S01E02 watched")));
  assert.equal(entries.length, 1);
});

test("watching cards keep their positions after logging, undo and refetches without sharing order across accounts", async () => {
  const initialShows = Array.from({ length: 6 }, (_, index) => ({
    tmdbId: 91001 + index,
    title: `Show ${index + 1}`,
    status: "watching",
    poster: null,
    updatedAt: "2025-01-01",
  }));
  let serverRows = [...initialShows];
  let entries: { season: number; episode: number }[] = [];
  const target = initialShows[3];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === "/api/viewing-status") return Response.json(serverRows);
    if (url.startsWith("/api/progress"))
      return Response.json(url.endsWith(String(target.tmdbId)) ? entries : []);
    if (url === "/api/watched" && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      assert.equal(body.tmdbId, target.tmdbId);
      entries = [{ season: body.season, episode: body.episode }];
      serverRows = [
        target,
        ...serverRows.filter((row) => row.tmdbId !== target.tmdbId),
      ];
      return Response.json({ ...body, id: 777 });
    }
    if (url === "/api/watched?id=777" && init?.method === "DELETE") {
      entries = [];
      serverRows = [...serverRows].reverse();
      return Response.json({ ok: true });
    }
    const path = new URL(url, "https://app.invalid").searchParams.get("path");
    const row = serverRows.find((item) => path === `/tv/${item.tmdbId}`);
    if (row) return Response.json({ ...show, id: row.tmdbId, name: row.title });
    if (path?.endsWith("/season/1")) return Response.json(season);
    throw new Error(`Unexpected request ${url}`);
  };
  const titles = () =>
    [...document.querySelectorAll("h3")].map((item) => item.textContent);
  const originalTitles = initialShows.map((item) => item.title);
  await mount(createElement(CurrentlyWatching));
  await waitFor(() =>
    assert.equal(document.querySelectorAll('[role="progressbar"]').length, 6),
  );
  assert.deepEqual(titles(), originalTitles);
  const card = document.querySelectorAll("h3")[3].closest("li")!;
  const mark = [...card.querySelectorAll("button")].find(
    (item) => item.textContent === "Mark S01E01 watched",
  )!;
  await act(async () => mark.click());
  await waitFor(() =>
    assert.match(card.textContent ?? "", /Marked S01E01 watched/),
  );
  await waitFor(() => assert.match(card.textContent ?? "", /Up next: S01E02/));
  assert.equal(
    serverRows[0].tmdbId,
    target.tmdbId,
    "the API really did move the watched show first",
  );
  await waitFor(() =>
    assert.equal(
      client.getQueryData<{ tmdbId: number }[]>([
        "viewing-shows",
        auth.userId,
      ])?.[0].tmdbId,
      target.tmdbId,
    ),
  );
  assert.deepEqual(titles(), originalTitles);
  assert.equal(document.querySelectorAll("h3")[3].closest("li"), card);
  await click("Undo");
  await waitFor(() => assert.match(card.textContent ?? "", /Up next: S01E01/));
  await waitFor(() =>
    assert.equal(
      client.getQueryData<{ tmdbId: number }[]>([
        "viewing-shows",
        auth.userId,
      ])?.[0].tmdbId,
      serverRows[0].tmdbId,
    ),
  );
  assert.deepEqual(titles(), originalTitles);

  const added = { ...initialShows[0], tmdbId: 91007, title: "New show" };
  serverRows = [added, ...serverRows];
  await act(async () => {
    await client.invalidateQueries({
      queryKey: ["viewing-shows", auth.userId],
    });
  });
  await waitFor(() => assert.ok(button("Show more")));
  assert.deepEqual(
    titles(),
    originalTitles,
    "a new show must not displace one of the six visible cards",
  );
  await click("Show more");
  await waitFor(() =>
    assert.deepEqual(titles(), [...originalTitles, added.title]),
  );

  serverRows = serverRows.map((row) =>
    row.tmdbId === target.tmdbId ? { ...row, status: "finished" } : row,
  );
  await act(async () => {
    await client.invalidateQueries({
      queryKey: ["viewing-shows", auth.userId],
    });
  });
  await waitFor(() =>
    assert.deepEqual(titles(), [
      ...originalTitles.filter((title) => title !== target.title),
      added.title,
    ]),
  );
  await click("Finished1");
  await waitFor(() => assert.deepEqual(titles(), [target.title]));
  await click("Watching6");
  assert.deepEqual(titles(), [
    ...originalTitles.filter((title) => title !== target.title),
    added.title,
  ]);

  serverRows = [initialShows[1], initialShows[0]];
  auth.userId = "another-user";
  await render(createElement(CurrentlyWatching));
  await waitFor(() =>
    assert.deepEqual(titles(), [initialShows[1].title, initialShows[0].title]),
  );
});

test("caught-up shows can be dismissed to Finished, retry failed saves and return without changing viewing history", async () => {
  let status = "watching";
  let failSave = true;
  const entries = [
    { season: 1, episode: 1 },
    { season: 1, episode: 2 },
  ];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === "/api/viewing-status") {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        assert.equal(body.tmdbId, 1399);
        if (failSave)
          return Response.json(
            { error: "Could not save status." },
            { status: 503 },
          );
        status = body.status;
        return Response.json({ ok: true });
      }
      return Response.json([
        {
          tmdbId: 1399,
          status,
          title: show.name,
          poster: null,
          updatedAt: "2025-01-01",
        },
      ]);
    }
    if (url === "/api/favorites") return Response.json([]);
    if (url.startsWith("/api/progress")) return Response.json(entries);
    const path = new URL(url, "https://app.invalid").searchParams.get("path");
    if (path === "/tv/1399") return Response.json(show);
    if (path === "/tv/1399/season/1") return Response.json(season);
    throw new Error(`Unexpected request ${url}`);
  };
  await mount(createElement(CurrentlyWatching));
  await waitFor(() => assert.ok(button("Mark finished")));
  await click("Mark finished");
  await waitFor(() =>
    assert.match(document.body.textContent ?? "", /Could not save status/),
  );
  assert.equal(status, "watching");
  assert.equal(document.querySelector("h3")?.textContent, show.name);
  assert.equal(button("Mark finished").disabled, false);

  failSave = false;
  await click("Mark finished");
  await waitFor(() => assert.ok(button("Finished1")));
  assert.equal(status, "finished");
  assert.equal(document.querySelector("h3"), null);
  assert.ok(button("Watching0"));
  await click("Finished1");
  await waitFor(() =>
    assert.equal(document.querySelector("select")?.value, "finished"),
  );
  assert.equal(document.querySelector("h3")?.textContent, show.name);
  assert.equal(
    [...document.querySelectorAll("button")].some(
      (item) => item.textContent === "Mark finished",
    ),
    false,
  );
  await act(async () => {
    const select = document.querySelector("select")!;
    select.value = "watching";
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  await waitFor(() => assert.ok(button("Watching1")));
  await click("Watching1");
  await waitFor(() => assert.ok(button("Mark finished")));
  assert.match(document.body.textContent ?? "", /Caught up/);
  assert.deepEqual(entries, [
    { season: 1, episode: 1 },
    { season: 1, episode: 2 },
  ]);
});

test("viewing status failures preserve the current selection, paused shows can resume, and accounts stay isolated", async () => {
  let status = "watching";
  let fail = true;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === "/api/viewing-status") {
      if (init?.method === "POST") {
        if (fail)
          return Response.json(
            { error: "Could not save status." },
            { status: 503 },
          );
        status = JSON.parse(String(init.body)).status;
        return Response.json({ ok: true });
      }
      return Response.json(
        auth.userId === "test-user"
          ? [
              {
                tmdbId: 1399,
                status,
                title: show.name,
                poster: null,
                updatedAt: "2025-01-01",
              },
            ]
          : [],
      );
    }
    if (url === "/api/favorites") return Response.json([]);
    if (url.startsWith("/api/progress")) return Response.json([]);
    const path = new URL(url, "https://app.invalid").searchParams.get("path");
    if (path === "/tv/1399") return Response.json(show);
    if (path === "/tv/1399/season/1") return Response.json(season);
    throw new Error(`Unexpected request ${url}`);
  };
  const selectStatus = async (value: string) =>
    act(async () => {
      const select = document.querySelector("select")!;
      select.value = value;
      select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
  await mount(createElement(CurrentlyWatching));
  await waitFor(() =>
    assert.equal(document.querySelector("select")?.value, "watching"),
  );
  await selectStatus("paused");
  await waitFor(() =>
    assert.match(document.body.textContent ?? "", /Could not save status/),
  );
  assert.equal(document.querySelector("select")?.value, "watching");
  fail = false;
  await selectStatus("paused");
  await waitFor(() =>
    assert.match(
      document.body.textContent ?? "",
      /Your next episode belongs here/,
    ),
  );
  await click("Paused1");
  await waitFor(() =>
    assert.equal(document.querySelector("select")?.value, "paused"),
  );
  assert.equal(
    [...document.querySelectorAll("button")].some((el) =>
      /Mark S/.test(el.textContent ?? ""),
    ),
    false,
  );
  await selectStatus("watching");
  await waitFor(() =>
    assert.match(
      document.body.textContent ?? "",
      /Shows you pause will stay here/,
    ),
  );
  await click("Watching1");
  await waitFor(() => assert.ok(document.querySelector("h3")));
  auth.userId = "another-user";
  await render(createElement(CurrentlyWatching));
  assert.equal(document.querySelector("h3"), null);
  await waitFor(() =>
    assert.match(
      document.body.textContent ?? "",
      /Your next episode belongs here/,
    ),
  );
  auth.userId = null;
  await render(createElement(CurrentlyWatching));
  assert.equal(document.querySelector("section"), null);
});

test("homepage keeps public discovery, personalizes signed-in visits, and retries a failed show list", async () => {
  auth.userId = null;
  auth.token = null;
  let fail = true;
  let personalRequests = 0;
  globalThis.fetch = async (input) => {
    if (String(input) === "/api/viewing-status") {
      personalRequests++;
      return fail
        ? Response.json({ error: "Unavailable" }, { status: 503 })
        : Response.json([]);
    }
    return Response.json({ results: [] });
  };
  await mount(createElement(Home));
  assert.match(
    document.querySelector("h1")?.textContent ?? "",
    /Find your next/,
  );
  assert.equal(personalRequests, 0);
  auth.userId = "test-user";
  auth.token = "test-token";
  await render(createElement(Home));
  await waitFor(() =>
    assert.match(document.body.textContent ?? "", /Could not load your shows/),
  );
  assert.equal(document.querySelector("h1")?.textContent, "What’s next?");
  assert.match(document.body.textContent ?? "", /Trending/);
  fail = false;
  await click("Try again");
  await waitFor(() =>
    assert.match(
      document.body.textContent ?? "",
      /Your next episode belongs here/,
    ),
  );
});

test("failed episode lookup is retryable and cannot show caught up or offer a watch action", async () => {
  let fail = true;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "/api/viewing-status")
      return Response.json([
        {
          tmdbId: 1399,
          status: "watching",
          title: show.name,
          poster: null,
          updatedAt: "2025-01-01",
        },
      ]);
    if (url.startsWith("/api/progress")) return Response.json([]);
    const path = new URL(url, "https://app.invalid").searchParams.get("path");
    if (path === "/tv/1399") return Response.json(show);
    if (path === "/tv/1399/season/1")
      return fail ? Response.json({}, { status: 503 }) : Response.json(season);
    throw new Error(`Unexpected request ${url}`);
  };
  await mount(createElement(CurrentlyWatching));
  await waitFor(() =>
    assert.match(
      document.body.textContent ?? "",
      /Could not load show details/,
    ),
  );
  assert.doesNotMatch(document.body.textContent ?? "", /Caught up|Mark S01/);
  fail = false;
  await click("Retry");
  await waitFor(() => assert.ok(button("Mark S01E01 watched")));
});

const watchedEpisode = {
  id: 401,
  tmdbId: 97546,
  mediaType: "tv",
  season: 4,
  episode: 2,
  title: "Ted Lasso",
  subtitle: "S04E02 · Curiouser and Curiouser!",
  poster: null,
  notes: "A memorable episode.\nWorth watching again.",
  watchedOn: "2024-05-01",
};
const watchedOptions = `Options for ${watchedEpisode.title}, ${watchedEpisode.subtitle}`;

test("watch-log titles link to movies and episodes and action menus support keyboard and dismissal", async () => {
  globalThis.fetch = async (input) => {
    assert.equal(
      new URL(String(input), "https://next-watch.test").pathname,
      "/api/watched",
    );
    return Response.json([
      watchedEpisode,
      {
        id: 402,
        tmdbId: 27205,
        mediaType: "movie",
        title: "Inception",
        watchedOn: "2024-05-01",
      },
    ]);
  };
  await mount(createElement(Watched));
  await waitFor(() =>
    assert.ok(
      document.querySelector(
        'a[href="/tv/episode?id=97546&season=4&episode=2"]',
      ),
    ),
  );
  const episodeLink = document.querySelector<HTMLAnchorElement>(
    'a[href="/tv/episode?id=97546&season=4&episode=2"]',
  )!;
  assert.match(episodeLink.textContent ?? "", /Ted Lasso.*S04E02/s);
  assert.equal(
    document.querySelector('a[href="/movie?id=27205"]')?.textContent,
    "Inception",
  );
  assert.ok(document.body.textContent?.includes(watchedEpisode.notes));
  assert.equal(document.querySelector("details"), null);
  assert.equal(document.querySelector('[role="menu"]'), null);

  await click(watchedOptions);
  assert.deepEqual(
    [...document.querySelectorAll('[role="menuitem"]')].map(
      (item) => item.textContent,
    ),
    ["Edit", "Delete"],
  );
  assert.equal(document.activeElement?.textContent, "Edit");
  async function press(key: string) {
    await act(async () => {
      document.activeElement?.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
  }
  await press("ArrowDown");
  assert.equal(document.activeElement?.textContent, "Delete");
  await press("ArrowDown");
  assert.equal(document.activeElement?.textContent, "Edit");
  await press("End");
  assert.equal(document.activeElement?.textContent, "Delete");
  await press("Home");
  assert.equal(document.activeElement?.textContent, "Edit");
  await press("Escape");
  assert.equal(document.querySelector('[role="menu"]'), null);
  assert.equal(document.activeElement, button(watchedOptions));
  assert.equal(button(watchedOptions).getAttribute("aria-expanded"), "false");

  await press("ArrowUp");
  assert.equal(document.activeElement?.textContent, "Delete");
  await act(async () => episodeLink.focus());
  assert.equal(document.querySelector('[role="menu"]'), null);
  await click(watchedOptions);
  await act(async () =>
    document.body.dispatchEvent(
      new dom.window.MouseEvent("pointerdown", { bubbles: true }),
    ),
  );
  assert.equal(document.querySelector('[role="menu"]'), null);

  await click(watchedOptions);
  await click("Options for Inception");
  assert.equal(document.querySelectorAll('[role="menu"]').length, 1);
  assert.equal(button(watchedOptions).getAttribute("aria-expanded"), "false");
});

test("watch-log Edit retains episode context and failed drafts, then saves and restores focus", async () => {
  const writes: Record<string, unknown>[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), "https://next-watch.test");
    assert.equal(url.pathname, "/api/watched");
    if (init?.method === "PATCH") {
      assert.equal(url.searchParams.get("id"), String(watchedEpisode.id));
      writes.push(JSON.parse(String(init.body)));
      return writes.length === 1
        ? Response.json({ error: "Could not update watch." }, { status: 503 })
        : Response.json({ ok: true });
    }
    return Response.json([watchedEpisode]);
  };
  await mount(createElement(Watched));
  await waitFor(() => assert.ok(button(watchedOptions)));
  await click(watchedOptions);
  await click("Edit");
  const dialog = document.querySelector<HTMLDialogElement>("dialog[open]")!;
  assert.ok(dialog);
  assert.equal(document.querySelector('[role="menu"]'), null);
  assert.equal(dialog.querySelector("h2")?.textContent, "Edit “Ted Lasso”");
  assert.equal(
    document.getElementById(dialog.getAttribute("aria-describedby")!)
      ?.textContent,
    watchedEpisode.subtitle,
  );
  const notes = dialog.querySelector<HTMLTextAreaElement>(
    'textarea[name="notes"]',
  )!;
  notes.value = "Updated watch notes";
  async function submit() {
    await act(async () =>
      dialog
        .querySelector("form")!
        .dispatchEvent(
          new dom.window.Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
  }
  await submit();
  await waitFor(() =>
    assert.match(dialog.textContent ?? "", /Could not update watch/),
  );
  assert.ok(dialog.open);
  assert.equal(notes.value, "Updated watch notes");
  assert.equal(writes[0].season, 4);
  assert.equal(writes[0].episode, 2);
  assert.equal(writes[0].notes, "Updated watch notes");
  await submit();
  await waitFor(() => assert.equal(dialog.open, false));
  assert.equal(writes.length, 2);
  assert.equal(document.activeElement, button(watchedOptions));

  await click(watchedOptions);
  await click("Edit");
  assert.equal(
    dialog.querySelector<HTMLTextAreaElement>('textarea[name="notes"]')?.value,
    watchedEpisode.notes,
  );
  await click("Cancel");
  assert.equal(dialog.open, false);
  assert.equal(document.activeElement, button(watchedOptions));
});

test("watch-log Delete requires confirmation and allows retry after a failed deletion", async () => {
  let attempts = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), "https://next-watch.test");
    assert.equal(url.pathname, "/api/watched");
    if (init?.method === "DELETE") {
      assert.equal(url.searchParams.get("id"), String(watchedEpisode.id));
      attempts++;
      return attempts === 1
        ? Response.json({ error: "Try again." }, { status: 503 })
        : Response.json({ ok: true });
    }
    return Response.json(attempts < 2 ? [watchedEpisode] : []);
  };
  await mount(createElement(Watched));
  await waitFor(() => assert.ok(button(watchedOptions)));
  await click(watchedOptions);
  await click("Delete");
  const dialog = document.querySelector<HTMLDialogElement>("dialog[open]")!;
  assert.ok(dialog);
  assert.equal(attempts, 0);
  assert.equal(document.querySelector('[role="menu"]'), null);
  await act(async () =>
    dialog.querySelector<HTMLButtonElement>("button")!.click(),
  );
  assert.equal(dialog.open, false);
  assert.equal(attempts, 0);
  assert.equal(document.activeElement, button(watchedOptions));

  await click(watchedOptions);
  await click("Delete");
  const confirm = [...dialog.querySelectorAll("button")].find(
    (item) => item.textContent === "Delete",
  )!;
  await act(async () => confirm.click());
  await waitFor(() => {
    assert.equal(attempts, 1);
    assert.equal(confirm.disabled, false);
  });
  assert.ok(dialog.open);
  await act(async () => confirm.click());
  await waitFor(() =>
    assert.equal(document.querySelector('a[href^="/tv/episode"]'), null),
  );
  assert.equal(attempts, 2);
});

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
  const reviewAction = actions.querySelector<HTMLButtonElement>(
    'button[aria-label="Write a review"]',
  );
  assert.ok(reviewAction);
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
    ...document.querySelectorAll<HTMLButtonElement>(
      'li [role="group"] button[aria-label="Write a review"]',
    ),
  ];
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

test("episode credits expand cast and guests independently, link people and preserve every crew role", async () => {
  globalThis.fetch = async () => Response.json([]);
  const cast = Array.from({ length: 13 }, (_, index) => ({
    id: 100 + index,
    name: `Actor ${index + 1}`,
    character: `Character ${index + 1}`,
    profile_path: null,
  }));
  const guests = cast.map((member) => ({
    ...member,
    id: member.id + 100,
    name: `Guest ${member.name}`,
  }));
  await mount(
    createElement(EpisodeDetail, {
      tvId: show.id,
      seasonNumber: 1,
      episodeNumber: 1,
      initialShow: show,
      initialData: {
        ...episode,
        episode_type: "finale",
        production_code: "101",
        vote_count: 1234,
        credits: {
          cast,
          guest_stars: guests,
          crew: [
            { id: 301, name: "Alex Writer", job: "Writer" },
            { id: 301, name: "Alex Writer", job: "Teleplay" },
            { id: 302, name: "Sam Editor", job: "Editor" },
            { id: 302, name: "Sam Editor", job: "Editor" },
          ],
        },
        external_ids: { imdb_id: "tt12345" },
        videos: {
          results: [
            {
              id: "preview",
              key: "abcdefghijk",
              name: "Episode preview",
              site: "YouTube",
              type: "Teaser",
              official: true,
              published_at: "2020-01-01T00:00:00Z",
            },
          ],
        },
      },
    }),
  );
  assert.equal(document.querySelector('a[href="/person?id=112"]'), null);
  const castButton = button("Show all cast (13)");
  const castList = document.getElementById(
    castButton.getAttribute("aria-controls")!,
  );
  assert.equal(castList?.children.length, 12);
  assert.equal(castButton.getAttribute("aria-expanded"), "false");
  await click("Show all cast (13)");
  assert.equal(castList?.children.length, 13);
  assert.equal(castButton.getAttribute("aria-expanded"), "true");
  assert.match(
    document.querySelector('a[href="/person?id=112"]')?.textContent ?? "",
    /Character 13/,
  );
  assert.equal(document.querySelector('a[href="/person?id=212"]'), null);
  await click("Show all guest stars (13)");
  assert.ok(document.querySelector('a[href="/person?id=212"]'));
  await click("Show fewer cast");
  assert.equal(castList?.children.length, 12);
  assert.ok(document.querySelector('a[href="/person?id=212"]'));

  const writers = [...document.querySelectorAll("dt")].find(
    (term) => term.textContent === "Writers",
  );
  assert.equal(writers?.nextElementSibling?.textContent, "Alex Writer");
  const crew = document.querySelector(
    '[aria-labelledby="episode-crew-heading"]',
  );
  assert.deepEqual(
    [...crew!.querySelectorAll("dt")].map((term) => term.textContent),
    ["Editor", "Teleplay", "Writer"],
  );
  assert.equal(crew?.querySelectorAll('a[href="/person?id=302"]').length, 1);
  assert.match(document.body.textContent ?? "", /1,234 votes/);
  assert.match(document.body.textContent ?? "", /Finale/);
  assert.match(document.body.textContent ?? "", /Production code101/);
  assert.ok(
    document.querySelector('a[href="https://www.imdb.com/title/tt12345/"]'),
  );
  assert.equal(document.querySelector("iframe"), null);
  await click("Play trailer: Episode preview");
  assert.equal(document.querySelector("iframe")?.title, "Episode preview");
});

test("episode credits fall back to base guests and crew when appended data is unavailable", async () => {
  globalThis.fetch = async () => Response.json([]);
  await mount(
    createElement(EpisodeDetail, {
      tvId: show.id,
      seasonNumber: 1,
      episodeNumber: 1,
      initialShow: show,
      initialData: {
        ...episode,
        episode_type: "mid_season",
        vote_count: 1,
        guest_stars: [
          {
            id: 401,
            name: "Guest actor",
            character: "Visitor",
            profile_path: null,
          },
        ],
        crew: [
          {
            id: 402,
            credit_id: "director",
            name: "Episode director",
            job: "Director",
          },
        ],
        external_ids: { imdb_id: "javascript:alert(1)" },
      },
    }),
  );
  assert.ok(document.querySelector('a[href="/person?id=401"]'));
  assert.ok(document.querySelector('a[href="/person?id=402"]'));
  const headings = [...document.querySelectorAll("h2")].map(
    (heading) => heading.textContent,
  );
  assert.ok(headings.includes("Guest stars"));
  assert.ok(headings.includes("Crew"));
  assert.ok(!headings.includes("Cast"));
  assert.ok(!headings.includes("Trailer"));
  assert.match(document.body.textContent ?? "", /1 vote\)/);
  assert.match(document.body.textContent ?? "", /Mid-season finale/);
  assert.ok(!document.querySelector('a[href*="imdb.com"]'));
});

test("sparse episode details omit empty credits and optional metadata", async () => {
  globalThis.fetch = async () => Response.json([]);
  await mount(
    createElement(EpisodeDetail, {
      tvId: show.id,
      seasonNumber: 1,
      episodeNumber: 1,
      initialShow: show,
      initialData: {
        ...episode,
        vote_average: 0,
        vote_count: 0,
        episode_type: "standard",
        production_code: "   ",
        credits: { cast: [], crew: [], guest_stars: [] },
        videos: { results: [] },
      },
    }),
  );
  assert.equal(document.querySelector("h1")?.textContent, "Pilot");
  assert.deepEqual(
    [...document.querySelectorAll("h2")]
      .filter((heading) => !heading.closest("dialog"))
      .map((heading) => heading.textContent),
    ["Overview"],
  );
  assert.equal(document.querySelector("dl"), null);
  assert.doesNotMatch(
    document.body.textContent ?? "",
    /TMDB rating|votes|Finale|IMDb|Production code/,
  );
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
  await click(`Review options for ${draft.title}, ${draft.subtitle}`);
  await click("Continue writing");
  await waitFor(() =>
    assert.equal(editorElement()?.textContent, "Saved review"),
  );
});

test("review cards show actions only in the creator's menu and remove them after account changes", async () => {
  const ownReview = {
    ...review,
    status: "published",
    updatedAt: "2026-10-02T00:00:00Z",
  };
  const otherReview = {
    ...ownReview,
    id: 8,
    tmdbId: 604,
    title: "Someone else's review",
    userId: "another-user",
  };
  const missingOwner = {
    ...ownReview,
    id: 9,
    tmdbId: 605,
    title: "Unknown author",
    userId: undefined,
  };
  let ownReads = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), "https://next-watch.test");
    assert.equal(url.pathname, "/api/reviews");
    if (url.searchParams.has("tmdbId")) {
      assert.equal(url.searchParams.get("tmdbId"), String(ownReview.tmdbId));
      ownReads++;
      return Response.json(ownReview);
    }
    return Response.json([ownReview, otherReview, missingOwner]);
  };
  await mount(createElement(Reviews));
  await waitFor(() =>
    assert.equal(document.querySelectorAll("article").length, 3),
  );
  const options = button(`Review options for ${ownReview.title}`);
  assert.equal(document.querySelectorAll('[aria-haspopup="menu"]').length, 1);
  assert.equal(
    [...document.querySelectorAll("button")].some(
      (item) => item.textContent === "Edit review",
    ),
    false,
  );
  assert.equal(ownReads, 0);
  await act(async () => {
    options.focus();
    options.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", {
        key: "ArrowUp",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  assert.deepEqual(
    [...document.querySelectorAll('[role="menuitem"]')].map(
      (item) => item.textContent,
    ),
    ["Edit review", "Delete review"],
  );
  assert.equal(document.activeElement?.textContent, "Delete review");
  await click("Edit review");
  await waitFor(() =>
    assert.equal(editorElement()?.textContent, "Saved review"),
  );
  assert.equal(document.querySelector('[role="menu"]'), null);
  assert.equal(ownReads, 1);
  await click("Close review dialog");
  assert.equal(document.querySelector("dialog[open]"), null);
  assert.equal(document.activeElement, options);

  await click(`Review options for ${ownReview.title}`);
  auth.userId = "viewer";
  await render(createElement(Reviews));
  await waitFor(() =>
    assert.equal(document.querySelectorAll("article").length, 3),
  );
  assert.equal(document.querySelector('[aria-haspopup="menu"]'), null);
  assert.equal(document.querySelector('[role="menu"]'), null);
  assert.equal(document.querySelector("dialog"), null);
  assert.equal(ownReads, 1);

  auth.userId = null;
  await render(createElement(Reviews));
  assert.equal(document.querySelector('[aria-haspopup="menu"]'), null);
  assert.equal(redirects.at(-1), "/auth/sign-in");
});

for (const status of ["published", "draft"]) {
  test(`${status} review menu deletion requires confirmation and recovers from auth and server failures`, async () => {
    const entry = {
      ...review,
      mediaType: "tv",
      season: 1,
      episode: 2,
      title: "Example show",
      subtitle: "S01E02 · Second episode",
      status,
      updatedAt: "2026-10-02T00:00:00Z",
    };
    let deleted = false;
    let attempts = 0;
    let finishDelete!: (response: Response) => void;
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input), "https://next-watch.test");
      assert.equal(url.pathname, "/api/reviews");
      if (init?.method === "DELETE") {
        assert.equal(url.searchParams.get("id"), String(entry.id));
        attempts++;
        if (attempts === 1)
          return Response.json({ error: "Try again." }, { status: 503 });
        return new Promise<Response>((resolve) => {
          finishDelete = resolve;
        });
      }
      return Response.json(deleted ? [] : [entry]);
    };
    await mount(createElement(Reviews));
    await waitFor(() => assert.ok(document.querySelector("article")));
    const options = `Review options for ${entry.title}, ${entry.subtitle}`;
    async function openDelete() {
      await click(options);
      const action = [
        ...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
      ].find((item) => item.textContent === "Delete review")!;
      assert.ok(action);
      await act(async () => action.click());
      return document.querySelector<HTMLDialogElement>("dialog[open]")!;
    }
    const confirmation = await openDelete();
    assert.ok(confirmation);
    assert.match(
      confirmation.textContent ?? "",
      /Example show.*S01E02 · Second episode/s,
    );
    assert.equal(document.querySelector('[role="menu"]'), null);
    assert.equal(attempts, 0);
    const cancel = [...confirmation.querySelectorAll("button")].find(
      (item) => item.textContent === "Cancel",
    )!;
    const confirm = [...confirmation.querySelectorAll("button")].find(
      (item) => item.textContent === "Delete review",
    )!;
    await act(async () => cancel.click());
    assert.equal(confirmation.open, false);
    assert.equal(attempts, 0);
    assert.ok(
      document.activeElement === button(options),
      "Cancel returns focus to the review menu",
    );

    await openDelete();
    auth.token = null;
    await act(async () => confirm.click());
    await waitFor(() =>
      assert.match(
        confirmation.querySelector('[role="alert"]')?.textContent ?? "",
        /Sign in to remove/,
      ),
    );
    assert.equal(attempts, 0);
    assert.ok(confirmation.open);
    auth.token = "test-token";
    await act(async () => confirm.click());
    await waitFor(() =>
      assert.match(
        confirmation.querySelector('[role="alert"]')?.textContent ?? "",
        /Couldn't delete/,
      ),
    );
    assert.equal(attempts, 1);
    assert.equal(document.querySelectorAll("article").length, 1);

    await act(async () => cancel.click());
    await openDelete();
    await waitFor(() =>
      assert.ok(
        !confirmation.querySelector('[role="alert"]'),
        "Reopening clears the previous error",
      ),
    );
    await act(async () => confirm.click());
    await waitFor(() => {
      assert.equal(attempts, 2);
      assert.equal(confirm.disabled, true);
    });
    assert.equal(cancel.disabled, true);
    const escape = new dom.window.Event("cancel", { cancelable: true });
    await act(async () => confirmation.dispatchEvent(escape));
    assert.equal(escape.defaultPrevented, true);
    await act(async () => {
      deleted = true;
      finishDelete(Response.json({ ok: true }));
    });
    await waitFor(() =>
      assert.equal(document.querySelectorAll("article").length, 0),
    );
    assert.equal(document.querySelector("dialog[open]"), null);
    assert.equal(attempts, 2);
  });
}

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
    userId: "test-user",
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
  await click("Review options for Review 31");
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
