import assert from "node:assert/strict";
import { test } from "node:test";
import { formatMoney, mediaLinks, peopleForJobs } from "./mediaFacts.ts";

test("movie crew deduplicates writing roles by person, not name", () => {
  const crew = [
    { id: 1, name: "Alex", job: "Director" },
    { id: 1, name: "Alex", job: "Screenplay" },
    { id: 1, name: "Alex", job: "Story" },
    { id: 2, name: "Alex", job: "Writer" },
    { id: 3, name: "Producer", job: "Producer" },
  ];
  assert.deepEqual(peopleForJobs(crew, ["Writer", "Screenplay", "Story"]), [
    { id: 1, name: "Alex" },
    { id: 2, name: "Alex" },
  ]);
  assert.deepEqual(peopleForJobs(crew, ["Director"]), [
    { id: 1, name: "Alex" },
  ]);
  assert.deepEqual(peopleForJobs(undefined, ["Director"]), []);
});

test("TV crew checks every aggregate job, including teleplay credits", () => {
  const crew = [
    {
      id: 1,
      name: "Showrunner",
      jobs: [
        { job: "Executive Producer", episode_count: 30 },
        { job: "Director", episode_count: 2 },
        { job: "Teleplay", episode_count: 8 },
      ],
    },
    { id: 2, name: "Crew", jobs: [] },
  ];
  assert.deepEqual(peopleForJobs(crew, ["Director"]), [
    { id: 1, name: "Showrunner" },
  ]);
  assert.deepEqual(peopleForJobs(crew, ["Writer", "Teleplay"]), [
    { id: 1, name: "Showrunner" },
  ]);
});

test("financial amounts use USD and distinguish missing data from zero dollars", () => {
  assert.equal(formatMoney(1_234_567_890), "$1,234,567,890 USD");
  for (const amount of [undefined, null, 0, -1, NaN, Infinity]) {
    assert.equal(formatMoney(amount), "Not reported");
  }
});

test("external links use supported providers and omit blank values", () => {
  assert.deepEqual(
    mediaLinks(" https://example.com/movie ", {
      facebook_id: "movie.page",
      instagram_id: "movie",
      twitter_id: "movie_news",
      imdb_id: "tt123",
    }),
    [
      { label: "Official website", href: "https://example.com/movie" },
      { label: "Facebook", href: "https://www.facebook.com/movie.page" },
      { label: "Instagram", href: "https://www.instagram.com/movie" },
      { label: "X (Twitter)", href: "https://x.com/movie_news" },
      { label: "IMDb", href: "https://www.imdb.com/title/tt123/" },
    ],
  );
  assert.deepEqual(mediaLinks(null, undefined), []);
  assert.deepEqual(
    mediaLinks("", {
      facebook_id: " ",
      instagram_id: null,
      twitter_id: "",
      imdb_id: "bad",
    }),
    [],
  );
});

test("upstream links cannot inject an executable URL or change a social link host", () => {
  for (const homepage of [
    "javascript:alert(1)",
    "data:text/html,test",
    "//example.com",
    "not a URL",
  ]) {
    assert.deepEqual(mediaLinks(homepage, undefined), []);
  }
  const [social] = mediaLinks(null, {
    twitter_id: "someone/?next=https://evil.example",
  });
  assert.equal(new URL(social.href).hostname, "x.com");
  assert.equal(new URL(social.href).search, "");
  assert.match(social.href, /someone%2F%3Fnext%3D/);
});
