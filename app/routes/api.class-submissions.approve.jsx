export const config = { runtime: "server" };

import { json } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * IMPORTANT:
 * Update CUSTOM_STATUS_FIELD_KEY to match the metaobject field key
 * in your Class Submission metaobject definition.
 *
 * Examples you might have:
 * - "status"
 * - "submission_status"
 * - "approval_status"
 */
const CUSTOM_STATUS_FIELD_KEY = "status"; // TODO: confirm/change this to your actual field key

export async function action({ request }) {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed." }, { status: 405 });
  }

  const { admin } = await authenticate.admin(request);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const entryId = (body && body.entryId) || "";
  if (!entryId) {
    return json({ ok: false, error: "Missing entryId." }, { status: 400 });
  }

  // Optional: allow setting to REJECTED, etc. Default is APPROVED.
  const newWorkflowStatus = (body && body.workflowStatus) || "APPROVED";

  const mutation = `#graphql
    mutation ApproveAndPublishMetaobject($id: ID!, $fields: [MetaobjectFieldInput!]!, $status: MetaobjectStatus!) {
      metaobjectUpdate(
        id: $id
        metaobject: {
          fields: $fields
          status: $status
        }
      ) {
        metaobject {
          id
          status
          fields {
            key
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    id: entryId,
    status: "ACTIVE", // This is the publish step
    fields: [
      { key: CUSTOM_STATUS_FIELD_KEY, value: String(newWorkflowStatus) }, // This is your workflow field
    ],
  };

  const resp = await admin.graphql(mutation, { variables });
  const data = await resp.json();

  const result = data?.data?.metaobjectUpdate;
  const userErrors = result?.userErrors || [];

  if (userErrors.length) {
    return json(
      { ok: false, error: "Shopify returned errors.", details: userErrors },
      { status: 400 }
    );
  }

  return json({ ok: true, metaobject: result?.metaobject });
}
