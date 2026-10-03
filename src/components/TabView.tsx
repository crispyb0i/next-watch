import { lazy, Suspense, type ReactNode } from "react";

const Home = lazy(() => import("./Home"));
const Discover = lazy(() => import("./Discover"));
const Search = lazy(() => import("./Search"));
const Reviews = lazy(() => import("./Reviews"));
const Feed = lazy(() => import("./Feed"));
const Watched = lazy(() => import("./Watched"));
const Favorites = lazy(() => import("./Favorites"));
const Alerts = lazy(() => import("./AvailabilityAlerts"));
const Library = lazy(() => import("./LibraryTransfer"));

type Props = {
  page:
    | "home"
    | "discover"
    | "search"
    | "reviews"
    | "feed"
    | "watched"
    | "favorites"
    | "watchlist"
    | "alerts"
    | "library";
  fallback?: ReactNode;
  initialQuery?: string;
  initialTab?: "all" | "movie" | "tv" | "person" | "users";
  initialPage?: number;
};

/** One persisted React root for the navigation tabs. Astro updates its props
 * in a React transition, so a lazy destination keeps the current page visible
 * until its module is ready. Warm queries render directly from the same cache. */
export default function TabView({ page, fallback, ...search }: Props) {
  const View = {
    home: Home,
    discover: Discover,
    search: Search,
    reviews: Reviews,
    feed: Feed,
    watched: Watched,
    favorites: Favorites,
    watchlist: Favorites,
    alerts: Alerts,
    library: Library,
  }[page];

  return (
    <Suspense fallback={fallback}>
      <View
        key={page}
        {...search}
        kind={page === "watchlist" ? "watchlist" : "favorite"}
      />
    </Suspense>
  );
}
