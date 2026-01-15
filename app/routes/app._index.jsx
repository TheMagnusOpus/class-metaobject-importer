import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { useLocation } from "react-router";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  const location = useLocation();
  const search = location.search || "";
  const withSearch = (path) => `${path}${search}`;

  return (
    <s-page heading="Class Metaobject Importer">
      <s-section heading="Bulk import and approve classes">
        <s-paragraph>
          Use this app to upload class submissions in bulk (CSV) and approve them
          before they appear on your storefront.
        </s-paragraph>

        <s-stack direction="inline" gap="base">
          <s-button href={withSearch("/app/import-classes")} variant="primary">
            Import classes
          </s-button>
          <s-button href={withSearch("/app/review-classes")} variant="secondary">
            Review submissions
          </s-button>
        </s-stack>

        <s-paragraph>
          Imported submissions default to <s-text emphasis="bold">Pending</s-text>.
          Approve them in the review screen.
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="What this app does">
        <s-paragraph>
          <s-unordered-list>
            <s-list-item>Upload CSV to create or update class metaobjects</s-list-item>
            <s-list-item>Keep new entries Pending until approved</s-list-item>
            <s-list-item>Approve entries to publish them to your directory</s-list-item>
          </s-unordered-list>
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Next steps">
        <s-unordered-list>
          <s-list-item>
            Go to <s-link href={withSearch("/app/import-classes")}>Import classes</s-link> and upload a CSV
          </s-list-item>
          <s-list-item>
            Then open <s-link href={withSearch("/app/review-classes")}>Review submissions</s-link> to approve
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
