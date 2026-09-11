/** Shared loading shapes — same grid/spacing as the real content, so the
 *  swap never shifts layout. */

export function PosterGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <ul
      className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, index) => (
        <li
          key={index}
          className="border-border/40 bg-surface-muted/50 aspect-[2/3] animate-pulse rounded-2xl border"
        />
      ))}
    </ul>
  );
}

export function DetailSkeleton({ backdrop = true }: { backdrop?: boolean }) {
  return (
    <div className="w-full animate-pulse" aria-hidden="true">
      {backdrop && (
        <div className="bg-surface-muted/40 relative left-1/2 -mt-8 h-[46vh] max-h-[34rem] min-h-64 w-screen -translate-x-1/2 sm:-mt-14 sm:h-[56vh]" />
      )}
      <div
        className={`flex flex-col gap-8 sm:flex-row sm:items-start ${
          backdrop ? "relative z-10 -mt-24 sm:-mt-32" : ""
        }`}
      >
        <div className="border-border/40 bg-surface-muted/50 aspect-[2/3] w-40 shrink-0 rounded-2xl border sm:w-52" />
        <div className="min-w-0 flex-1 space-y-4">
          <div className="bg-surface-muted/60 h-9 w-3/4 rounded-lg" />
          <div className="bg-surface-muted/50 h-4 w-1/3 rounded" />
          <div className="flex gap-2">
            {[16, 20, 14].map((width) => (
              <div
                key={width}
                className="bg-surface-muted/50 h-6 rounded-full"
                style={{ width: `${width * 4}px` }}
              />
            ))}
          </div>
          <div className="space-y-2 pt-2">
            {["100%", "96%", "92%", "70%"].map((width) => (
              <div
                key={width}
                className="bg-surface-muted/50 h-3.5 rounded"
                style={{ width }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
