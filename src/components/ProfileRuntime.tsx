import { useQuery } from "@tanstack/react-query";
import { fetchRuntime, formatRuntime } from "../lib/profileActivity";
import QueryProvider from "./QueryProvider";

function Runtime({ path }: { path: string }) {
  const { data } = useQuery({
    queryKey: ["profile-runtime", path],
    queryFn: ({ signal }) => fetchRuntime(path, signal),
    retry: false,
  });
  if (!data) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap"
      aria-label={`Runtime: ${formatRuntime(data)}`}
    >
      <svg
        aria-hidden="true"
        className="size-4 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" strokeLinecap="round" />
      </svg>
      {formatRuntime(data)}
    </span>
  );
}

export default function ProfileRuntime({ path }: { path: string }) {
  return (
    <QueryProvider>
      <Runtime path={path} />
    </QueryProvider>
  );
}
