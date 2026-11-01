// Local-only harness around the actual trainerCommand, D1 and orchestrator.
import { env } from "cloudflare:workers";
import { trainerCommand, trainerState } from "../lib/trainer-data";
type QAEnv = { QA_PROXY_URL: string; QA_CAPABILITY: string; SKILLER_ENV: string };
const nativeFetch = globalThis.fetch;
globalThis.fetch = (async (input, init) => {
  const flags = env as unknown as QAEnv;
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (flags.SKILLER_ENV !== "test" || url !== "https://api.openai.com/v1/responses" || !/^http:\/\/127\.0\.0\.1:\d+$/.test(flags.QA_PROXY_URL)) throw new Error("Unexpected outbound QA request");
  return nativeFetch(`${flags.QA_PROXY_URL}/responses`, { ...init, headers: { "content-type": "application/json", "x-qa-capability": flags.QA_CAPABILITY } });
}) as typeof fetch;
const worker = {
  async fetch(request: Request) {
    const flags = env as unknown as QAEnv;
    if (flags.SKILLER_ENV !== "test" || request.headers.get("x-qa-capability") !== flags.QA_CAPABILITY) return new Response("Forbidden", { status: 403 });
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({ ok: true });
    try {
      const body = await request.json() as { user: string; command?: Record<string, unknown> };
      if (!/^(marsha|beck|skinny|practice|risk[1-3])$/.test(body.user)) return new Response("Unknown synthetic user", { status: 400 });
      const user = { userId: `live-qa-${flags.QA_CAPABILITY.slice(0, 8)}-${body.user}`, displayName: "Synthetic QA", email: `${body.user}@example.invalid`, fullName: null };
      if (url.pathname === "/state") return Response.json(await trainerState(user));
      if (url.pathname === "/command") return Response.json(await trainerCommand(user, body.command));
      return new Response("Not found", { status: 404 });
    } catch { return Response.json({ error: "Synthetic backend command failed" }, { status: 400 }); }
  },
};
export default worker;
