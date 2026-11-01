import { GUEST_COOKIE_NAME, readGuestId } from "@/lib/guest-session";
import { assertSameOrigin, boundaryResponse } from "@/lib/request-boundary";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try { assertSameOrigin(request); } catch (error) { return boundaryResponse(error); }
  const url = new URL(request.url);
  const returnTo = safeRelativeReturnPath(
    url.searchParams.get("return_to") ?? "/",
  );
  const guestId = readGuestId(request.headers.get("cookie")) ?? crypto.randomUUID();
  const location = new URL(returnTo, url.origin).toString();
  const cookie = [
    `${GUEST_COOKIE_NAME}=${encodeURIComponent(guestId)}`,
    "Path=/",
    `Max-Age=${ONE_YEAR_SECONDS}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");

  return new Response(null, {
    status: 303,
    headers: {
      Location: location,
      "Set-Cookie": cookie,
      "Cache-Control": "no-store",
    },
  });
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  try {
    const url = new URL(value, "https://app.local");
    if (url.origin !== "https://app.local") return "/";
    if (url.pathname.startsWith("/api/auth/")) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
