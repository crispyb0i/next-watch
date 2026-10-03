export default function ActionIcon({
  kind,
  active = false,
}: {
  kind: "favorite" | "watchlist" | "log" | "review" | "list";
  active?: boolean;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
    >
      {kind === "favorite" && (
        <path
          fill={active ? "currentColor" : "none"}
          d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"
        />
      )}
      {kind === "watchlist" && (
        <path
          fill={active ? "currentColor" : "none"}
          d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z"
        />
      )}
      {kind === "log" && (
        <>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M8 3v4M16 3v4M3 11h18M8 15h2M14 15h2M8 18h2" />
        </>
      )}
      {kind === "review" && (
        <>
          <path d="m16 3 5 5-12 12-6 1 1-6L16 3ZM13 6l5 5" />
          <path d="M3 21h18" />
        </>
      )}
      {kind === "list" && (
        <>
          <path d="M8 5h12M8 10h12M8 15h5M17 14v7M13.5 17.5h7" />
          <path d="M3 5h.01M3 10h.01M3 15h.01" strokeWidth="3" />
        </>
      )}
    </svg>
  );
}
