import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { useNavigate } from "react-router";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  const navigate = useNavigate();

  return (
    <s-page heading="Class Metaobject Importer">
      <s-section heading="Bulk import and approve classes">
        <s-paragraph>
          Use this app to upload class submissions in bulk (CSV) and approve them
          before they appear on your storefront.
        </s-paragraph>
        <s-stack direction="inline" gap="base">
          <s-button
            variant="primary"
            onClick={() => navigate("/app/import-classes")}
          >
            Import classes
          </s-button>
          <s-button
            variant="secondary"
            onClick={() => navigate("/app/review-classes")}
          >
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
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
