export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function bodyJson(
  request: Request,
): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (text.length > 100_000) return null;
  try {
    const body = JSON.parse(text);
    return body && typeof body === "object" && !Array.isArray(body)
      ? body
      : null;
  } catch {
    return null;
  }
}
