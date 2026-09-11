// Run: node --experimental-strip-types src/lib/revealGroup.test.ts
import assert from "node:assert/strict";
import { createRevealTracker } from "./revealGroup.ts";

// All images settle -> reveal once, after mount.
{
  let reveals = 0;
  const t = createRevealTracker(() => reveals++);
  t.register();
  t.register();
  t.markLoaded();
  assert.equal(reveals, 0, "no reveal before mount");
  t.mount();
  assert.equal(reveals, 0, "one image still pending");
  t.markLoaded();
  assert.equal(reveals, 1, "revealed when last image settled");
  t.markLoaded();
  assert.equal(reveals, 1, "reveal is idempotent");
}

// Nothing to load -> reveal on mount.
{
  let reveals = 0;
  const t = createRevealTracker(() => reveals++);
  t.mount();
  assert.equal(reveals, 1, "empty group reveals immediately");
}

// Unmounting a pending image unblocks the group.
{
  let reveals = 0;
  const t = createRevealTracker(() => reveals++);
  const off = t.register();
  t.register();
  t.mount();
  t.markLoaded();
  assert.equal(reveals, 0, "one image still pending");
  off();
  assert.equal(reveals, 1, "unregister released the group");
}

// Timeout escape hatch wins over a hung image.
{
  let reveals = 0;
  const t = createRevealTracker(() => reveals++);
  t.register();
  t.mount();
  t.reveal();
  assert.equal(reveals, 1, "timeout revealed");
  t.markLoaded();
  assert.equal(reveals, 1, "late load does not re-reveal");
}

console.log("revealGroup: all checks passed");
