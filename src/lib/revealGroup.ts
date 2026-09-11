/**
 * Counts images in a group and reveals them all at once — one paint instead of
 * a staggered trickle. Reveals when every registered image settled, the
 * timeout fires, or there was nothing to load.
 */
export function createRevealTracker(onReveal: () => void) {
  let total = 0;
  let loaded = 0;
  let mounted = false;
  let revealed = false;

  const check = () => {
    if (revealed || !mounted || loaded < total) return;
    revealed = true;
    onReveal();
  };

  return {
    /** Called by each image on mount; returns an unregister fn. */
    register() {
      if (!revealed) total++;
      return () => {
        if (revealed) return;
        total--;
        check();
      };
    },
    markLoaded() {
      if (revealed) return;
      loaded++;
      check();
    },
    /** Parent effect runs after children register, so counts are final. */
    mount() {
      mounted = true;
      check();
    },
    /** Escape hatch: slow network, a hung image, etc. */
    reveal() {
      if (revealed) return;
      revealed = true;
      onReveal();
    },
  };
}
