import type { Movie, TvShow } from "../lib/tmdb";
import { posterUrl } from "../lib/tmdb";
import MediaCard from "./MediaCard";
import ImageGroup from "./ImageGroup";

/** "More like this" row for a movie/tv detail page. Rows come free on the
 *  detail request via `append_to_response`, so there's no extra fetch. */
export default function RelatedGrid({
  items,
  mediaType,
  title = "More like this",
}: {
  items: (Movie | TvShow)[];
  mediaType: "movie" | "tv";
  title?: string;
}) {
  if (items.length === 0) return null;

  return (
    <div className="mt-14">
      <h2 className="text-text-primary text-xl font-extrabold tracking-tight">
        {title}
      </h2>
      <ImageGroup>
        <ul className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {/* ponytail: fixed 12, no "show all" — add pagination if users ask. */}
          {items.slice(0, 12).map((item) => (
            <MediaCard
              key={item.id}
              href={`/${mediaType}?id=${item.id}`}
              title={"title" in item ? item.title : item.name}
              subtitle={(
                ("release_date" in item
                  ? item.release_date
                  : item.first_air_date) ?? ""
              ).slice(0, 4)}
              poster={posterUrl(item.poster_path)}
              rating={item.vote_average}
            />
          ))}
        </ul>
      </ImageGroup>
    </div>
  );
}
