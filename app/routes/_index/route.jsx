import { redirect } from "react-router";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  // Merchant installing/opening the app from Shopify admin — this always
  // arrives with a ?shop= param. Send it into the embedded admin app as before.
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  // Anyone else hitting the root (e.g. submit.learnleathercraft.com directly)
  // is a public visitor — send them straight to the class submission form
  // instead of showing the unbuilt placeholder page.
  throw redirect("/pages/leathercraft-classes/submit");
};
