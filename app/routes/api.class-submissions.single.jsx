import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  await authenticate.admin(request);
  return Response.json({ ok: true, message: "single endpoint placeholder" });
};

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return Response.json({ ok: true, message: "single endpoint placeholder" });
};
