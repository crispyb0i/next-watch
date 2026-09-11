// Never point integration tests at the app's configured database.
const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.error("Set TEST_DATABASE_URL to a disposable test database.");
  process.exit(1);
}
const parsed = new URL(url);
if (
  !["localhost", "127.0.0.1"].includes(parsed.hostname) &&
  !parsed.pathname.toLowerCase().includes("test")
) {
  console.error(
    "The isolated database name must contain test, or use localhost.",
  );
  process.exit(1);
}
process.env.DATABASE_URL = url;
process.env.NEXT_WATCH_TEST_DATABASE = "1";
await import("../src/lib/follows.test.ts");
