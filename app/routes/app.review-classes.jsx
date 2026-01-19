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

const LIST = `#graphql
query ListClasses($first: Int!) {
  metaobjects(type: "class_submission", first: $first) {
    nodes {
      id
      handle
      fields { key value }
    }
  }
}
`;

const APPROVE_AND_PUBLISH = `#graphql
mutation ApproveAndPublish($id: ID!) {
  metaobjectUpdate(
    id: $id,
    metaobject: {
      fields: [{ key: "status", value: "Approved" }]
    }
  ) {
    metaobject { id handle }
    userErrors { field message }
  }
  
  metaobjectPublish(id: $id) {
    metaobject { id handle }
    userErrors { field message }
  }
}
`;

const PUBLISH_ONLY = `#graphql
mutation PublishOnly($id: ID!) {
  metaobjectPublish(id: $id) {
    metaobject { id handle }
    userErrors { field message }
  }
}
`;

function getField(fields, key) {
  const f = (fields || []).find((x) => x.key === key);
  return f?.value || "";
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

function formatDateOnly(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function stripRichTextToPlain(value) {
  if (!value) return "";
  try {
    const obj = JSON.parse(value);

    const walk = (node) => {
      if (!node) return "";
      if (typeof node === "string") return node;
      if (Array.isArray(node)) return node.map(walk).join(" ");
      if (node.type === "text" && node.value) return node.value;
      if (node.children) return walk(node.children);
      return "";
    };

    return walk(obj).replace(/\s+/g, " ").trim();
  } catch {
    return String(value).replace(/\s+/g, " ").trim();
  }
}

function cardDetails(m) {
  const title = getField(m.fields, "class_title") || m.handle;
  const instructor = getField(m.fields, "instructor_name");

  const startRaw = getField(m.fields, "start_date");
  const start = formatDateOnly(startRaw);

  const format = getField(m.fields, "format");
  const cost = getField(m.fields, "cost");

  const city = getField(m.fields, "location_city");
  const state = getField(m.fields, "location_state");
  const location = [city, state].filter(Boolean).join(", ");

  const descRaw = getField(m.fields, "class_description");
  const description = stripRichTextToPlain(descRaw);

  const submittedByName = getField(m.fields, "submitted_by_name");
  const submittedByEmail = getField(m.fields, "submitted_by_email");

  const workflowStatus = "Unknown";
 const publishStatus = "N/A (cannot query via API)";

  return {
    title,
    instructor,
    start,
    format,
    cost,
    location,
    description,
    submittedByName,
    submittedByEmail,
    workflowStatus,
    publishStatus,
  };
}

export const loader = async ({ request }) => {
  // If shop/host are missing, pull them from Referer and redirect
  // BEFORE calling authenticate.admin (prevents {shop: null}).
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

  const { admin } = await authenticate.admin(request);

  const resp = await admin.graphql(LIST, { variables: { first: 250 } });
  const json = await resp.json();
  const nodes = json?.data?.metaobjects?.nodes || [];

  const pending = nodes.filter((m) => {
    const s = (getField(m.fields, "status") || "").toLowerCase();
    return s === "pending";
  });

  // These are the ones you already "Approved" but are still not published
  const approvedDrafts = nodes.filter((m) => {
    const s = (getField(m.fields, "status") || "").toLowerCase();
    const pub = (m.status || "").toString().toUpperCase();
    return s === "approved" && pub !== "ACTIVE";
  });

  return { pending, approvedDrafts, shop: ctx.shop, host: ctx.host };
};

export const action = async ({ request }) => {
  console.log("review-classes action hit:", request.method, request.url);

  // Ensure context exists even on POST by rebuilding it from URL or Referer
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

  // Authenticate using a GET request with the corrected URL (keeps shop/host present)
  const authRequest = new Request(url.toString(), {
    method: "GET",
    headers: request.headers,
  });

  const { admin } = await authenticate.admin(authRequest);

  const fd = await request.formData();
  const rawId = fd.get("id");
  const rawIntent = fd.get("intent");

  const id = typeof rawId === "string" ? rawId : "";
  const intent = typeof rawIntent === "string" ? rawIntent : "approve";

  if (!id) return { ok: false, error: "Missing id." };

  const mutation =
    intent === "publish" ? PUBLISH_ONLY : APPROVE_AND_PUBLISH;

  const resp = await admin.graphql(mutation, { variables: { id } });
  const json = await resp.json();

 const userErrors = [
  ...(json?.data?.metaobjectUpdate?.userErrors || []),
  ...(json?.data?.metaobjectPublish?.userErrors || [])
];

  if (userErrors.length) {
    return { ok: false, error: userErrors.map((e) => e.message).join("; ") };
  }

  return {
    ok: true,
    message:
      intent === "publish"
        ? "Published."
        : "Approved and published.",
  };
};

export default function ReviewClasses() {
  const { pending, approvedDrafts, shop, host } = useLoaderData();
  const actionData = useActionData();
  const nav = useNavigation();
  const fetcher = useFetcher();

  const busy = nav.state !== "idle" || fetcher.state !== "idle";

  // Preserve the current query string for the action URL
  const search = typeof window !== "undefined" ? window.location.search : "";
  const actionUrl = `/app/review-classes${search}`;

  return (
    <s-page heading="Review submissions">
      {actionData?.error ? (
        <s-section heading="Error">
          <s-paragraph>{actionData.error}</s-paragraph>
        </s-section>
      ) : null}

      {actionData?.ok ? (
        <s-section heading="Success">
          <s-paragraph>{actionData.message || "Done."}</s-paragraph>
        </s-section>
      ) : null}

      {fetcher.data?.error ? (
        <s-section heading="Error">
          <s-paragraph>{fetcher.data.error}</s-paragraph>
        </s-section>
      ) : null}

      {fetcher.data?.ok ? (
        <s-section heading="Success">
          <s-paragraph>{fetcher.data.message || "Done."}</s-paragraph>
        </s-section>
      ) : null}

      <s-section heading={`Pending submissions (${pending.length})`}>
        {pending.length === 0 ? (
          <s-paragraph>No pending submissions yet.</s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {pending.map((m) => {
              const {
                title,
                instructor,
                start,
                format,
                cost,
                location,
                description,
                submittedByName,
                submittedByEmail,
                workflowStatus,
                publishStatus,
              } = cardDetails(m);

              return (
                <s-section key={m.id} heading={title}>
                  <s-paragraph>
                    <s-text emphasis="bold">
                      Workflow: {workflowStatus || "Unknown"}
                    </s-text>
                    <br />
                    <s-text emphasis="bold">
                      Publish status: {publishStatus || "Unknown"}
                    </s-text>
                    <br />

                    {!submittedByName && !submittedByEmail ? (
                      <>
                        <s-text emphasis="bold">
                          Submitted by: Unknown (verify before approving)
                        </s-text>
                        <br />
                      </>
                    ) : (
                      <>
                        Submitted by:{" "}
                        <s-text emphasis="bold">
                          {submittedByName || "Unknown"}
                          {submittedByEmail ? ` (${submittedByEmail})` : ""}
                        </s-text>
                        <br />
                      </>
                    )}

                    {instructor ? (
                      <>
                        Instructor: <s-text emphasis="bold">{instructor}</s-text>
                        <br />
                      </>
                    ) : null}

                    {location ? (
                      <>
                        Location: <s-text emphasis="bold">{location}</s-text>
                        <br />
                      </>
                    ) : null}

                    {start ? (
                      <>
                        Date: <s-text emphasis="bold">{start}</s-text>
                        <br />
                      </>
                    ) : null}

                    {format ? (
                      <>
                        Format: <s-text emphasis="bold">{format}</s-text>
                        <br />
                      </>
                    ) : null}

                    {cost ? (
                      <>
                        Cost: <s-text emphasis="bold">{cost}</s-text>
                        <br />
                      </>
                    ) : null}

                    {description ? (
                      <>
                        Description: <s-text>{description}</s-text>
                      </>
                    ) : null}
                  </s-paragraph>

                  <fetcher.Form method="post" action={actionUrl}>
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="intent" value="approve" />

                    {/* Kept for safety / future use (not required for auth now) */}
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
                </s-section>
              );
            })}
          </s-stack>
        )}
      </s-section>

      <s-section heading={`Approved but not published (${approvedDrafts.length})`}>
        {approvedDrafts.length === 0 ? (
          <s-paragraph>No approved drafts found.</s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {approvedDrafts.map((m) => {
              const {
                title,
                instructor,
                start,
                format,
                cost,
                location,
                description,
                submittedByName,
                submittedByEmail,
                workflowStatus,
                publishStatus,
              } = cardDetails(m);

              return (
                <s-section key={m.id} heading={title}>
                  <s-paragraph>
                    <s-text emphasis="bold">
                      Workflow: {workflowStatus || "Unknown"}
                    </s-text>
                    <br />
                    <s-text emphasis="bold">
                      Publish status: {publishStatus || "Unknown"}
                    </s-text>
                    <br />

                    {submittedByName || submittedByEmail ? (
                      <>
                        Submitted by:{" "}
                        <s-text emphasis="bold">
                          {submittedByName || "Unknown"}
                          {submittedByEmail ? ` (${submittedByEmail})` : ""}
                        </s-text>
                        <br />
                      </>
                    ) : null}

                    {instructor ? (
                      <>
                        Instructor: <s-text emphasis="bold">{instructor}</s-text>
                        <br />
                      </>
                    ) : null}

                    {location ? (
                      <>
                        Location: <s-text emphasis="bold">{location}</s-text>
                        <br />
                      </>
                    ) : null}

                    {start ? (
                      <>
                        Date: <s-text emphasis="bold">{start}</s-text>
                        <br />
                      </>
                    ) : null}

                    {format ? (
                      <>
                        Format: <s-text emphasis="bold">{format}</s-text>
                        <br />
                      </>
                    ) : null}

                    {cost ? (
                      <>
                        Cost: <s-text emphasis="bold">{cost}</s-text>
                        <br />
                      </>
                    ) : null}

                    {description ? (
                      <>
                        Description: <s-text>{description}</s-text>
                      </>
                    ) : null}
                  </s-paragraph>

                  <fetcher.Form method="post" action={actionUrl}>
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="intent" value="publish" />

                    {/* Kept for safety / future use (not required for auth now) */}
                    <input type="hidden" name="shop" value={shop || ""} />
                    <input type="hidden" name="host" value={host || ""} />

                    <s-button
                      type="submit"
                      variant="primary"
                      {...(busy ? { loading: true } : {})}
                    >
                      Publish
                    </s-button>
                  </fetcher.Form>
                </s-section>
              );
            })}
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
