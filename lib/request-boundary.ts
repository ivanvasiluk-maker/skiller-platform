// Shared HTTP boundary: enforce actual streamed bytes, not a client claim.
export class RequestBoundaryError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  try {
    if ((origin && new URL(origin).origin !== new URL(request.url).origin) ||
        request.headers.get("sec-fetch-site") === "cross-site") throw new Error();
  } catch { throw new RequestBoundaryError(403, "Недопустимый источник"); }
}
export async function boundedRequest(request: Request, limit: number): Promise<Request> {
  assertSameOrigin(request);
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let oversized = false;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) {
          // Drain without retaining bytes so the HTTP connection can finish.
          oversized = true;
          chunks.length = 0;
        } else if (!oversized) chunks.push(value);
      }
    } finally { reader.releaseLock(); }
  }
  if (oversized) throw new RequestBoundaryError(413, "Слишком большой запрос");
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new Request(request.url, { method: request.method, headers: request.headers, body: bytes });
}
export function boundaryResponse(error: unknown) {
  return Response.json({ error: error instanceof RequestBoundaryError ? error.message : "Не удалось обработать запрос. Проверьте данные и обновите страницу." },
    { status: error instanceof RequestBoundaryError ? error.status : 400, headers: { "Cache-Control": "no-store" } });
}
