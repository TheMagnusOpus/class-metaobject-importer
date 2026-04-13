// app/routes/app.review-classes.jsx
import prisma from "../db.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  useLoaderData,
  useActionData,
  useNavigation,
  useFetcher,
  useRouteError,
  redirect,
} from "react-router";

const METAOBJECT_UPSERT = `#graphql
mutation MetaobjectUpsert($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
  metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
    metaobject { id handle }
    userErrors { field message }
  }
}
`;

function toRichTextJSON(text) {
  const safe = (text ?? "").toString().trim();
  if (!safe) return "";
  return JSON.stringify({
    type: "root",
    children: [
      { type: "paragraph", children: [{ type: "text", value: safe }] },
    ],
  });
}

function slugify(s) {
  return (s ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function getContextFromUrlOrReferer(request) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "";
  const host = url.searchParams.get("host") || "";

  if (shop && host) return { shop, host };

  const ref = request.headers.get("referer");
  if (ref) {
    try {
      const r = new URL(ref);
      return {
        shop: shop || r.searchParams.get("shop") || "",
        host: host || r.searchParams.get("host") || "",
      };
    } catch {
      // ignore
    }
  }

  return { shop, host };
}

// Map Prisma enum values to human-readable strings for Shopify
function formatEnumForShopify(value) {
  if (!value) return "";
  return value
    .toString()
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const ctx = getContextFromUrlOrReferer(request);

  if (
    (!url.searchParams.get("shop") || !url.searchParams.get("host")) &&
    ctx.shop &&
    ctx.host
  ) {
    url.searchParams.set("shop", ctx.shop);
    url.searchParams.set("host", ctx.host);
    throw redirect(url.toString());
  }

  await authenticate.admin(request);

  // Read pending submissions from PostgreSQL
  const pending = await prisma.classSubmission.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });

  // Also load recently approved for visibility
  const recentlyApproved = await prisma.classSubmission.findMany({
    where: { status: "APPROVED" },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });

  return {
    pending,
    recentlyApproved,
    shop: ctx.shop,
    host: ctx.host,
  };
};

export const action = async ({ request }) => {
  const url = new URL(request.url);
  const ctx = getContextFromUrlOrReferer(request);

  if (
    (!url.searchParams.get("shop") || !url.searchParams.get("host")) &&
    ctx.shop &&
    ctx.host
  ) {
    url.searchParams.set("shop", ctx.shop);
    url.searchParams.set("host", ctx.host);
  }

  const authRequest = new Request(url.toString(), {
    method: "GET",
    headers: request.headers,
  });

  const { admin } = await authenticate.admin(authRequest);

  const fd = await request.formData();
  const id = fd.get("id");
  const intent = fd.get("intent") || "approve";

  if (!id) return { ok: false, error: "Missing submission id." };

  // Handle rejection — just update DB status
  if (intent === "reject") {
    await prisma.classSubmission.update({
      where: { id },
      data: { status: "REJECTED" },
    });
    return { ok: true, message: "Submission rejected." };
  }

  // Handle approval — create Shopify metaobject then update DB
  if (intent === "approve") {
    // Fetch the submission from the database
    const submission = await prisma.classSubmission.findUnique({
      where: { id },
    });

    if (!submission) {
      return { ok: false, error: "Submission not found." };
    }

    // Build a unique handle from title + id suffix
    const handle = `${slugify(submission.classTitle)}-${id.slice(-6)}`;

    const fields = [
      { key: "external_id", value: handle },
      { key: "class_title", value: submission.classTitle },
      { key: "class_description", value: toRichTextJSON(submission.description) },
      { key: "instructor_name", value: submission.submittedByName },
      { key: "format", value: formatEnumForShopify(submission.format) },
      { key: "location_city", value: submission.locationCity },
      { key: "location_state", value: submission.locationState },
      {
        key: "start_date",
        value: submission.startDate
          ? new Date(submission.startDate).toISOString()
          : "",
      },
      { key: "cost", value: submission.cost },
      { key: "registration_url", value: submission.classUrl || "" },
      { key: "topics", value: formatEnumForShopify(submission.topic) },
      { key: "submitted_by_name", value: submission.submittedByName },
      { key: "submitted_by_email", value: submission.submittedByEmail },
      { key: "status", value: "Approved" },
    ];

    // Filter out empty values
    const cleanedFields = fields.filter(
      (f) => typeof f.value === "string" && f.value.trim().length > 0
    );

    const variables = {
      handle: { type: "class_submission", handle },
      metaobject: {
        fields: cleanedFields,
        capabilities: { publishable: { status: ACTIVE } },
      },
    };

    const resp = await admin.graphql(METAOBJECT_UPSERT, { variables });
    const json = await resp.json();

    const userErrors = json?.data?.metaobjectUpsert?.userErrors || [];
    if (userErrors.length) {
      return {
        ok: false,
        error: `Shopify error: ${userErrors.map((e) => e.message).join("; ")}`,
      };
    }

    // Mark as approved in the database
    await prisma.classSubmission.update({
      where: { id },
      data: { status: "APPROVED" },
    });

    return { ok: true, message: "Submission approved and published to Shopify." };
  }

  return { ok: false, error: "Unknown intent." };
};

export default function ReviewClasses() {
  const { pending, recentlyApproved, shop, host } = useLoaderData();
  const actionData = useActionData();
  const nav = useNavigation();
  const fetcher = useFetcher();

  const busy = nav.state !== "idle" || fetcher.state !== "idle";
  const search = typeof window !== "undefined" ? window.location.search : "";
  const actionUrl = `/app/review-classes${search}`;

  return (
    <s-page heading="Review submissions">
      {actionData?.error && (
        <s-section heading="Error">
          <s-paragraph>{actionData.error}</s-paragraph>
        </s-section>
      )}

      {actionData?.ok && (
        <s-section heading="Success">
          <s-paragraph>{actionData.message || "Done."}</s-paragraph>
        </s-section>
      )}

      {fetcher.data?.error && (
        <s-section heading="Error">
          <s-paragraph>{fetcher.data.error}</s-paragraph>
        </s-section>
      )}

      {fetcher.data?.ok && (
        <s-section heading="Success">
          <s-paragraph>{fetcher.data.message || "Done."}</s-paragraph>
        </s-section>
      )}

      <s-section heading={`Pending submissions (${pending.length})`}>
        {pending.length === 0 ? (
          <s-paragraph>No pending submissions yet.</s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {pending.map((s) => (
              <s-section key={s.id} heading={s.classTitle}>
                <s-paragraph>
                  Submitted by:{" "}
                  <s-text emphasis="bold">
                    {s.submittedByName} ({s.submittedByEmail})
                  </s-text>
                  <br />
                  Location:{" "}
                  <s-text emphasis="bold">
                    {s.locationCity}, {s.locationState}
                  </s-text>
                  <br />
                  Date:{" "}
                  <s-text emphasis="bold">
                    {s.startDate
                      ? new Date(s.startDate).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "2-digit",
                        })
                      : "Unknown"}
                  </s-text>
                  <br />
                  Format:{" "}
                  <s-text emphasis="bold">{s.format?.replace(/_/g, " ")}</s-text>
                  <br />
                  Cost: <s-text emphasis="bold">{s.cost}</s-text>
                  <br />
                  Topic: <s-text emphasis="bold">{s.topic?.replace(/_/g, " ")}</s-text>
                  {s.classUrl && (
                    <>
                      <br />
                      URL: <s-text emphasis="bold">{s.classUrl}</s-text>
                    </>
                  )}
                  {s.description && (
                    <>
                      <br />
                      Description: <s-text>{s.description}</s-text>
                    </>
                  )}
                  <br />
                  Submitted:{" "}
                  <s-text>
                    {new Date(s.createdAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "2-digit",
                    })}
                  </s-text>
                </s-paragraph>

                <s-stack direction="inline" gap="tight">
                  <fetcher.Form method="post" action={actionUrl}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="intent" value="approve" />
                    <input type="hidden" name="shop" value={shop || ""} />
                    <input type="hidden" name="host" value={host || ""} />
                    <s-button
                      type="submit"
                      variant="primary"
                      {...(busy ? { loading: true } : {})}
                    >
                      Approve and publish
                    </s-button>
                  </fetcher.Form>

                  <fetcher.Form method="post" action={actionUrl}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="intent" value="reject" />
                    <input type="hidden" name="shop" value={shop || ""} />
                    <input type="hidden" name="host" value={host || ""} />
                    <s-button
                      type="submit"
                      variant="secondary"
                      {...(busy ? { loading: true } : {})}
                    >
                      Reject
                    </s-button>
                  </fetcher.Form>
                </s-stack>
              </s-section>
            ))}
          </s-stack>
        )}
      </s-section>

      <s-section heading={`Recently approved (${recentlyApproved.length})`}>
        {recentlyApproved.length === 0 ? (
          <s-paragraph>No approved submissions yet.</s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {recentlyApproved.map((s) => (
              <s-section key={s.id} heading={s.classTitle}>
                <s-paragraph>
                  Submitted by:{" "}
                  <s-text emphasis="bold">
                    {s.submittedByName} ({s.submittedByEmail})
                  </s-text>
                  <br />
                  Approved:{" "}
                  <s-text>
                    {new Date(s.updatedAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "2-digit",
                    })}
                  </s-text>
                </s-paragraph>
              </s-section>
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
