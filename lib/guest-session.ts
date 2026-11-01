export const GUEST_COOKIE_NAME = "__Host-skiller_guest";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function readGuestId(cookie: string | null): string | null {
  const values = (cookie ?? "").split(";").map(part => part.trim()).filter(part => part.startsWith(`${GUEST_COOKIE_NAME}=`));
  if (values.length !== 1) return null;
  try {
    const value = decodeURIComponent(values[0].slice(GUEST_COOKIE_NAME.length + 1));
    return UUID.test(value) ? value : null;
  } catch { return null; }
}
