import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { after, afterEach, test } from "node:test";
import { act, createElement } from "react";
import { JSDOM } from "jsdom";
import ts from "typescript";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  IS_REACT_ACT_ENVIRONMENT: true,
});
// JSDOM lacks native dialogs. Test lifecycle here; focus trapping and Escape
// keyboard behavior still require a browser.
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
  this.dispatchEvent(new dom.window.Event("close"));
};

const componentUrl = new URL("../components/ImageViewer.tsx", import.meta.url);
const hooks = registerHooks({
  load(url, context, next) {
    if (url === componentUrl.href) {
      return {
        format: "module",
        source: ts.transpileModule(readFileSync(componentUrl, "utf8"), {
          compilerOptions: {
            jsx: ts.JsxEmit.ReactJSX,
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
          },
        }).outputText,
        shortCircuit: true,
      };
    }
    return next(url, context);
  },
});
const { createRoot } = await import("react-dom/client");
const { default: ImageViewer } = await import("../components/ImageViewer.tsx");
let root: ReturnType<typeof createRoot> | undefined;

async function mount() {
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => {
    root!.render(
      createElement(ImageViewer, {
        src: "https://image.tmdb.org/t/p/w500/poster.jpg",
        fullSrc: "https://image.tmdb.org/t/p/original/poster.jpg",
        alt: "Arrival poster",
      }),
    );
  });
  return {
    trigger: document.querySelector<HTMLButtonElement>(
      'button[aria-haspopup="dialog"]',
    )!,
    dialog: document.querySelector("dialog")!,
    close: document.querySelector<HTMLButtonElement>(
      'button[aria-label="Close image viewer"]',
    )!,
  };
}

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  document.documentElement.style.overflow = "";
});
after(() => {
  hooks.deregister();
  dom.window.close();
});

test("poster viewer loads the original on demand and restores focus on close", async () => {
  const { trigger, dialog, close } = await mount();
  assert.equal(
    trigger.getAttribute("aria-label"),
    "View Arrival poster fullscreen",
  );
  assert.equal(trigger.getAttribute("aria-controls"), dialog.id);
  assert.equal(dialog.getAttribute("aria-label"), "Arrival poster");
  assert.equal(dialog.open, false);
  assert.equal(dialog.querySelector("img"), null);

  await act(async () => trigger.click());
  assert.equal(dialog.open, true);
  assert.equal(document.activeElement, close);
  assert.equal(document.documentElement.style.overflow, "hidden");
  const image = dialog.querySelector("img")!;
  assert.equal(image.src, "https://image.tmdb.org/t/p/original/poster.jpg");
  await act(async () => image.dispatchEvent(new dom.window.Event("load")));
  assert.equal(dialog.querySelector('[role="status"]'), null);
  await act(async () => image.click());
  assert.equal(dialog.open, true, "clicking the image keeps the viewer open");

  await act(async () => close.click());
  assert.equal(dialog.open, false);
  assert.equal(dialog.querySelector("img"), null);
  assert.equal(document.activeElement, trigger);
  assert.equal(document.documentElement.style.overflow, "");

  await act(async () => trigger.click());
  await act(async () => dialog.querySelector("div")!.click());
  assert.equal(
    dialog.open,
    false,
    "clicking the empty backdrop closes the viewer",
  );
  assert.equal(document.activeElement, trigger);
});

test("failed originals fall back to the preview and failed images remain dismissible", async () => {
  const { trigger, dialog, close } = await mount();
  await act(async () => trigger.click());
  const image = dialog.querySelector("img")!;
  await act(async () => image.dispatchEvent(new dom.window.Event("error")));
  assert.equal(image.src, "https://image.tmdb.org/t/p/w500/poster.jpg");
  await act(async () => image.dispatchEvent(new dom.window.Event("error")));
  assert.match(
    dialog.querySelector('[role="alert"]')?.textContent ?? "",
    /couldn’t be loaded/,
  );
  assert.equal(dialog.querySelector("img"), null);
  await act(async () => close.click());
  assert.equal(document.documentElement.style.overflow, "");

  await act(async () => trigger.click());
  assert.equal(dialog.querySelector('[role="alert"]'), null);
  assert.equal(
    dialog.querySelector("img")!.src,
    "https://image.tmdb.org/t/p/original/poster.jpg",
  );
});

test("native dismissal and unmount restore the previous page scroll setting", async () => {
  document.documentElement.style.overflow = "auto";
  const { trigger, dialog } = await mount();
  await act(async () => trigger.click());
  await act(async () => dialog.close());
  assert.equal(document.documentElement.style.overflow, "auto");
  assert.equal(document.activeElement, trigger);

  await act(async () => trigger.click());
  await act(async () => root!.unmount());
  root = undefined;
  assert.equal(document.documentElement.style.overflow, "auto");
});
