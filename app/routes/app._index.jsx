import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { useLoaderData } from "react-router";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "";
  const host = url.searchParams.get("host") || "";
  return { shop, host };
};

export default function Index() {
  const { shop, host } = useLoaderData();
  const params = new URLSearchParams({ shop, host }).toString();

  return (
    <s-page heading="Class Metaobject Importer">
      <s-section heading="Bulk import and approve classes">
        <s-paragraph>
          Use this app to upload class submissions in bulk (CSV) and approve
          them before they appear on your storefront.
        </s-paragraph>
        <s-stack direction="inline" gap="base">
          <s-button
            variant="primary"
            href={`/app/import-classes?${params}`}
          >
            Import classes
          </s-button>
          <s-button
            variant="secondary"
            href={`/app/review-classes?${params}`}
          >
            Review submissions
          </s-button>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
