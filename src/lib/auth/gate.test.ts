// Run: node --experimental-strip-types src/lib/auth/gate.test.ts
import assert from "node:assert/strict";
import { safeNext } from "./gate.ts";

// Open-redirect guard: only same-origin paths survive.
assert.equal(safeNext("/watchlist?a=1"), "/watchlist?a=1");
assert.equal(safeNext("//evil.com"), "/");
assert.equal(safeNext("https://evil.com"), "/");
assert.equal(safeNext("javascript:alert(1)"), "/");
assert.equal(safeNext(null), "/");
assert.equal(safeNext(""), "/");

console.log("gate.test.ts ok");
