import { useEffect, useState } from "react";
import AuthGate from "./AuthGate";
import { accountApi } from "../lib/accountApi";
import type { tasteMatches } from "../lib/taste";
interface Room {
  id: string;
  title: string;
}
interface RoomDetails {
  night: Room;
  members: { id: string; name: string | null }[];
  candidates: {
    tmdbId: number;
    mediaType: string;
    title: string;
    votes: number;
    voted: boolean;
  }[];
}
function CommunityInner() {
  const [rooms, setRooms] = useState<Room[]>([]),
    [room, setRoom] = useState<RoomDetails | null>(null),
    [title, setTitle] = useState(""),
    [invite, setInvite] = useState("");
  const [recommendations, setRecommendations] = useState<
    ReturnType<typeof tasteMatches>
  >([]);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  const reload = async () => {
    const [list, taste] = await Promise.all([
      accountApi<Room[]>("/api/nights"),
      accountApi<ReturnType<typeof tasteMatches>>("/api/taste"),
    ]);
    setRooms(list);
    setRecommendations(taste);
    setLoaded(true);
  };
  useEffect(() => {
    void reload().catch((e) => setError(e.message));
    const code = new URLSearchParams(location.search).get("join");
    if (code) setInvite(code);
  }, []);
  async function action(body: unknown) {
    setBusy(true);
    setError("");
    try {
      const result = await accountApi<{ id?: string }>("/api/nights", body);
      await reload();
      const id = result.id ?? room?.night.id;
      if (id)
        setRoom(
          await accountApi<RoomDetails>(
            `/api/nights?id=${encodeURIComponent(id)}`,
          ),
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-10">
      <h1 className="text-3xl font-bold">Watch with friends</h1>
      {error && (
        <p role="alert" className="text-danger">
          {error}{" "}
          <button
            className="underline"
            onClick={() => void reload().catch((e) => setError(e.message))}
          >
            Retry
          </button>
        </p>
      )}
      <section className="space-y-4">
        <h2 className="text-xl font-bold">Movie nights</h2>
        <p className="text-text-muted">
          Combine members’ watchlists, exclude titles anyone has logged, and
          vote on a shortlist. Joining shares your watchlist with this group.
          Anyone with the invite can join.
        </p>
        <form
          className="flex flex-wrap gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void action({ action: "create", title });
          }}
        >
          <input
            aria-label="Movie night name"
            required
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Friday movie night"
            className="rounded-xl border p-3"
          />
          <button disabled={busy} className="rounded-xl border px-4">
            Create movie night
          </button>
        </form>
        <form
          className="flex flex-wrap gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void action({ action: "join", id: invite.trim() });
          }}
        >
          <input
            aria-label="Invite code"
            required
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
            placeholder="Paste invite code"
            className="rounded-xl border p-3"
          />
          <button disabled={busy} className="rounded-xl border px-4">
            Join movie night
          </button>
        </form>
        {!loaded && !error && <p role="status">Loading movie nights…</p>}
        <ul className="flex flex-wrap gap-3">
          {rooms.map((item) => (
            <li key={item.id}>
              <button
                className="rounded-xl border px-4 py-2"
                onClick={() => {
                  setError("");
                  void accountApi<RoomDetails>(`/api/nights?id=${item.id}`)
                    .then(setRoom)
                    .catch((e) => setError(e.message));
                }}
              >
                {item.title}
              </button>
            </li>
          ))}
        </ul>
        {room && (
          <div className="space-y-4 rounded-2xl border p-5">
            <h3 className="text-xl font-bold">{room.night.title}</h3>
            <p>
              {room.members.map((member) => member.name ?? "Member").join(", ")}
            </p>
            <p className="text-sm break-all">
              Invite code: <code>{room.night.id}</code>
            </p>
            <button
              className="underline"
              onClick={() =>
                void navigator.clipboard
                  .writeText(
                    `${location.origin}/community?join=${room.night.id}`,
                  )
                  .catch(() =>
                    setError(
                      "Could not copy. Select and copy the invite code above.",
                    ),
                  )
              }
            >
              Copy invite link
            </button>
            {!room.candidates.length && (
              <p>
                No unwatched titles in common yet. Add titles to your
                watchlists.
              </p>
            )}
            <p className="text-text-muted text-sm">
              Up to 100 titles from your combined lists.
            </p>
            <ul className="space-y-3">
              {room.candidates.map((item) => (
                <li
                  key={`${item.mediaType}:${item.tmdbId}`}
                  className="flex items-center justify-between gap-4"
                >
                  <a
                    className="underline"
                    href={`/${item.mediaType === "tv" ? "tv" : "movie"}?id=${item.tmdbId}`}
                  >
                    {item.title}
                  </a>
                  <button
                    aria-pressed={item.voted}
                    disabled={busy}
                    className="rounded-xl border px-3 py-2"
                    onClick={() =>
                      void action({
                        action: "vote",
                        id: room.night.id,
                        tmdbId: item.tmdbId,
                        mediaType: item.mediaType,
                        remove: item.voted,
                      })
                    }
                  >
                    {item.voted ? "Remove vote" : "Vote"} · {item.votes}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      <section className="space-y-4">
        <h2 className="text-xl font-bold">From friends with similar taste</h2>
        <p className="text-text-muted">
          Based on at least three shared rated titles and 70% rating agreement.
          These are ratings-based suggestions, not predictions.
        </p>
        {loaded && !recommendations.length && (
          <p>
            Follow friends and rate more shared titles to get recommendations.
          </p>
        )}
        <ul className="space-y-5">
          {recommendations.map((item) => (
            <li
              key={`${item.mediaType}:${item.tmdbId}`}
              className="rounded-2xl border p-4"
            >
              <a
                className="font-bold underline"
                href={`/${item.mediaType}?id=${item.tmdbId}`}
              >
                {item.title}
              </a>
              {item.reasons.map((reason) => (
                <p key={reason} className="text-text-muted mt-2 text-sm">
                  {reason}
                </p>
              ))}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
export default function Community() {
  return (
    <AuthGate>
      <CommunityInner />
    </AuthGate>
  );
}
