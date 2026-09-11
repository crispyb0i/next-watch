import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

const createClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // TMDB data barely moves; serve cache instantly instead of refetching
        // on every mount/focus.
        staleTime: 5 * 60_000,
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });

let browserClient: QueryClient | undefined;

export default function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() =>
    typeof window === "undefined"
      ? createClient()
      : (browserClient ??= createClient()),
  );
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
