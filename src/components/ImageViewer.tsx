import { useEffect, useId, useRef, useState } from "react";

export default function ImageViewer({
  src,
  fullSrc,
  alt,
}: {
  src: string;
  fullSrc?: string | null;
  alt: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const dialogId = useId();
  const [open, setOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState(fullSrc ?? src);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    const page = document.documentElement;
    const overflow = page.style.overflow;
    page.style.overflow = "hidden";
    return () => {
      page.style.overflow = overflow;
    };
  }, [open]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={`View ${alt} fullscreen`}
        aria-haspopup="dialog"
        aria-controls={dialogId}
        className="focus-visible:outline-accent relative block w-full cursor-zoom-in focus-visible:outline-2 focus-visible:-outline-offset-4"
        onClick={() => {
          setImageSrc(fullSrc ?? src);
          setLoading(true);
          setFailed(false);
          dialog.current?.showModal();
          setOpen(true);
          closeButton.current?.focus();
        }}
      >
        <img
          src={src}
          alt={alt}
          width={500}
          height={750}
          className="aspect-[2/3] w-full object-cover object-top"
        />
        <span className="pointer-events-none absolute right-2 bottom-2 grid size-8 place-items-center rounded-full bg-black/65 text-white">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5" />
          </svg>
        </span>
      </button>

      <dialog
        ref={dialog}
        id={dialogId}
        aria-label={alt}
        className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden overscroll-contain border-0 bg-black/95 p-0 text-white backdrop:bg-black/90"
        onClose={() => {
          setOpen(false);
          trigger.current?.focus();
        }}
        onClick={(event) => {
          if (
            event.target === event.currentTarget ||
            event.target === frame.current
          ) {
            dialog.current?.close();
          }
        }}
      >
        <button
          ref={closeButton}
          type="button"
          aria-label="Close image viewer"
          className="absolute top-4 right-4 z-10 grid size-11 place-items-center rounded-full border border-white/30 bg-black/70 text-white transition hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          onClick={() => dialog.current?.close()}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
        <div
          ref={frame}
          className="flex h-full w-full items-center justify-center p-4 pt-20 sm:p-12"
        >
          {open && (
            <>
              {loading && !failed && (
                <p role="status" className="absolute">
                  Loading image…
                </p>
              )}
              {failed ? (
                <p role="alert">This image couldn’t be loaded.</p>
              ) : (
                <img
                  src={imageSrc}
                  alt={alt}
                  className={`relative block max-h-full max-w-full object-contain ${loading ? "invisible" : ""}`}
                  onLoad={() => setLoading(false)}
                  onError={() => {
                    if (imageSrc !== src) setImageSrc(src);
                    else setFailed(true);
                  }}
                />
              )}
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
