import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createRevealTracker } from "../lib/revealGroup";

type Group = {
  ready: boolean;
  register: () => () => void;
  markLoaded: () => void;
};

const GroupContext = createContext<Group | null>(null);

const noop = () => {};

export default function ImageGroup({
  children,
  timeoutMs = 1500,
}: {
  children: ReactNode;
  /** Remount with a `key` to start a new batch (new query, new filter). */
  timeoutMs?: number;
}) {
  const [ready, setReady] = useState(false);
  const tracker = useMemo(
    () => createRevealTracker(() => setReady(true)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    tracker.mount();
    const timeout = setTimeout(() => tracker.reveal(), timeoutMs);
    return () => clearTimeout(timeout);
  }, [tracker, timeoutMs]);

  const value = useMemo<Group>(
    () => ({
      ready,
      register: tracker.register,
      markLoaded: tracker.markLoaded,
    }),
    [ready, tracker],
  );

  return (
    <GroupContext.Provider value={value}>{children}</GroupContext.Provider>
  );
}

/** Outside a group: ready immediately, so components work standalone. */
export function useGroupImage(hasImage: boolean) {
  const group = useContext(GroupContext);

  useEffect(() => {
    if (!group || !hasImage) return;
    return group.register();
  }, [group, hasImage]);

  return {
    ready: group?.ready ?? true,
    onSettled: group?.markLoaded ?? noop,
  };
}
