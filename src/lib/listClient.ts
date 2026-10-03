import { useQuery } from "@tanstack/react-query";
import { accountApi } from "./accountApi";
import { authClient, getJWTToken } from "./auth/client";
import type { ListDetail, ListSummary } from "./lists";

export function useLists(enabled = true) {
  const { data: session } = authClient.useSession();
  return useQuery({
    queryKey: ["lists", "mine", session?.user.id],
    queryFn: () => accountApi<ListSummary[]>("/api/lists"),
    enabled: enabled && !!session,
    retry: false,
    staleTime: 0,
  });
}

export function useList(id: string, initialData?: ListDetail) {
  const { data: session, isPending } = authClient.useSession();
  return useQuery({
    queryKey: ["lists", "detail", id, session?.user.id ?? "public"],
    queryFn: async ({ signal }) => {
      const token = session ? await getJWTToken() : null;
      if (session && !token)
        throw new Error("Sign in again to view your list.");
      const response = await fetch(`/api/lists?id=${encodeURIComponent(id)}`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
        cache: "no-store",
        signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not load this list.");
      return data as ListDetail;
    },
    initialData: !session ? initialData : undefined,
    enabled: !isPending,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });
}
