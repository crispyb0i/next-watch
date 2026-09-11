import { useQuery } from "@tanstack/react-query";
import { authClient } from "../lib/auth/client";
import { accountApi } from "../lib/accountApi";
import type { EpisodeProgress } from "../lib/progress";
import type { Season } from "../lib/tmdb";
export function useShowProgress(tvId: number) {
  const { data: session } = authClient.useSession();
  return useQuery({
    queryKey: ["progress", session?.user.id, tvId],
    queryFn: () => accountApi<EpisodeProgress[]>(`/api/progress?id=${tvId}`),
    enabled: Boolean(session),
  });
}
export default function ShowProgress({
  tvId,
  seasons,
}: {
  tvId: number;
  seasons: Season[];
}) {
  const { data, error } = useShowProgress(tvId);
  if (error)
    return (
      <p role="alert" className="text-danger">
        Could not load viewing progress.
      </p>
    );
  if (!data) return null;
  const regular = seasons.filter((season) => season.season_number > 0);
  const next = regular.find(
    (season) =>
      !data.some(
        (entry) =>
          entry.season === null ||
          (entry.season === season.season_number && entry.episode === null),
      ) &&
      new Set(
        data
          .filter(
            (entry) =>
              entry.season === season.season_number && entry.episode != null,
          )
          .map((entry) => entry.episode),
      ).size < season.episode_count,
  );
  return (
    <p className="mt-5">
      {next ? (
        <a
          className="underline"
          href={`/tv/season?id=${tvId}&season=${next.season_number}`}
        >
          Continue tracking: {next.name}
        </a>
      ) : (
        "All listed seasons logged."
      )}
    </p>
  );
}
