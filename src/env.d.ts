/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_TMDB_API_KEY: string;
  readonly DATABASE_URL: string;
  readonly NEON_AUTH_BASE_URL: string;
  readonly NEON_AUTH_COOKIE_SECRET: string;
  readonly PUBLIC_NEON_AUTH_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
