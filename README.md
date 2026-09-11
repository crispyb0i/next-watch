# Next Watch

Discover movies and TV shows, save favorites, log watches, and follow friends.

## Development

Requires Node.js 22.12 or newer.

```sh
npm install
npm run dev
```

Create `.env.local` with:

```dotenv
PUBLIC_TMDB_API_KEY=
DATABASE_URL=
NEON_AUTH_BASE_URL=
NEON_AUTH_COOKIE_SECRET=
PUBLIC_NEON_AUTH_URL=
```

## Commands

| Command               | Action                       |
| --------------------- | ---------------------------- |
| `npm run dev`         | Start development server     |
| `npm run build`       | Build production app         |
| `npm run preview`     | Preview production build     |
| `npm run db:generate` | Generate database migrations |
| `npm run db:migrate`  | Run database migrations      |
| `npm run db:studio`   | Open Drizzle Studio          |
