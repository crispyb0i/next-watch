// Run: node --experimental-strip-types src/lib/trailer.test.ts
import assert from "node:assert/strict";
import { pickTrailer, type Video } from "./tmdb.ts";

const video = (over: Partial<Video>): Video => ({
  id: over.key ?? "x",
  key: "x",
  name: "clip",
  site: "YouTube",
  type: "Trailer",
  official: true,
  published_at: "2024-01-01",
  ...over,
});

// Nothing embeddable -> null.
assert.equal(pickTrailer(undefined), null, "no videos");
assert.equal(pickTrailer([]), null, "empty list");
assert.equal(pickTrailer([video({ site: "Vimeo" })]), null, "non-YouTube");
assert.equal(pickTrailer([video({ type: "Featurette" })]), null, "wrong type");

// Official trailer outranks teasers and fan uploads.
assert.equal(
  pickTrailer([
    video({ key: "teaser", type: "Teaser" }),
    video({ key: "fan", official: false }),
    video({ key: "real" }),
  ])?.key,
  "real",
  "official trailer wins",
);

// Equal rank -> newest wins.
assert.equal(
  pickTrailer([
    video({ key: "old", published_at: "2020-01-01" }),
    video({ key: "new", published_at: "2025-06-01" }),
  ])?.key,
  "new",
  "newest wins tie",
);

console.log("trailer.test.ts ok");
