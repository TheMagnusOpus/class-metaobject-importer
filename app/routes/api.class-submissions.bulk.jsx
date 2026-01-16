/**
 * Bulk endpoint placeholder.
 * Keep it build-safe until you implement it.
 */
export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  return Response.json({ ok: true, message: "bulk endpoint not implemented yet" });
};

export const loader = async ({ request }) => {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  return Response.json({ ok: true, message: "bulk endpoint ok" });
};
