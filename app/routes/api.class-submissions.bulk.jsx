import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  await authenticate.admin(request);

  // If you’re not using this route yet, keep it simple and valid for SSR builds.
  return Response.json({ ok: true, message: "bulk endpoint placeholder" });
};

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return Response.json({ ok: true, message: "bulk endpoint placeholder" });
};
