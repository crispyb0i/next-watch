// Run: node --experimental-strip-types src/lib/likePattern.test.ts
import assert from "node:assert/strict";
import { containsPattern } from "./likePattern.ts";

assert.equal(containsPattern("bob"), "%bob%");
// A user typing `%` must not match everyone.
assert.equal(containsPattern("100%"), "%100\\%%");
assert.equal(containsPattern("a_b"), "%a\\_b%");
assert.equal(containsPattern("c\\d"), "%c\\\\d%");

console.log("ok");
