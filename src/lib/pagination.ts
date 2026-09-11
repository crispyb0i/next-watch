export function pagination(params: URLSearchParams) {
  const read = (key: string, fallback: number, min: number, max: number) => {
    const raw = params.get(key);
    if (raw === null) return fallback;
    const value = Number(raw);
    if (
      !/^\d+$/.test(raw) ||
      !Number.isSafeInteger(value) ||
      value < min ||
      value > max
    )
      throw new Error(`Invalid ${key}`);
    return value;
  };
  return {
    limit: read("limit", 30, 1, 100),
    offset: read("offset", 0, 0, 1_000_000),
  };
}
