const worker = {
  async fetch(_request, env) {
    const row = await env.DB.prepare("SELECT 1 AS ok").first();
    return Response.json(row);
  },
};

export default worker;
