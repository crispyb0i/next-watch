export default function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <fieldset>
      <legend className="sr-only">Rating</legend>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => {
          const fill = Math.max(0, Math.min(1, value - (star - 1))) * 100;
          return (
            <span key={star} className="relative h-7 w-7">
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="text-text-muted absolute inset-0 h-full w-full fill-none stroke-current stroke-2"
              >
                <path d="m12 2.5 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9L12 2.5Z" />
              </svg>
              <span
                aria-hidden="true"
                className="text-star absolute inset-y-0 left-0 overflow-hidden"
                style={{ width: `${fill}%` }}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-7 w-7 fill-current stroke-current stroke-2"
                >
                  <path d="m12 2.5 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9L12 2.5Z" />
                </svg>
              </span>
              {[star - 0.5, star].map((rating, half) => (
                <label
                  key={rating}
                  aria-label={`${rating} of 5 stars`}
                  className={`focus-within:outline-accent absolute inset-y-0 z-10 w-1/2 cursor-pointer rounded focus-within:outline-2 ${half ? "right-0" : "left-0"}`}
                >
                  <input
                    type="radio"
                    name="rating"
                    value={rating}
                    checked={value === rating}
                    onChange={() => onChange(rating)}
                    className="sr-only"
                  />
                </label>
              ))}
            </span>
          );
        })}
        {value > 0 && (
          <button
            type="button"
            onClick={() => onChange(0)}
            aria-label="Clear rating"
            className="text-text-muted hover:text-text-primary ml-2 text-xs"
          >
            Clear
          </button>
        )}
      </div>
    </fieldset>
  );
}
