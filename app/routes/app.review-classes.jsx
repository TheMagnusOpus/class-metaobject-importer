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

function formatEnumForShopify(value) {
  if (!value) return "";
  const map = {
    IN_PERSON: "In-person",
    ONLINE: "Online",
    HYBRID: "Hybrid",
    TOOLING: "Tooling",
    DYEING_AND_FINISHING: "Dyeing and finishing",
    ASSEMBLY: "Assembly",
    SADDLERY: "Saddlery",
    BAGS_AND_ACCESSORIES: "Bags & Accessories",
    SMALL_GOODS: "Small goods",
    BUSINESS_CLASS: "Business class",
    OTHER: "Other",
    BEGINNER: "Beginner",
    INTERMEDIATE: "Intermediate",
    ADVANCED: "Advanced",
    ALL_SKILL_LEVELS: "All Skill Levels",
  };
  return map[value] || value.toString().replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// Classes that came in through the CSV importer are written directly as
// Shopify metaobjects (bypassing the Prisma queue entirely), so this page
// has to ask Shopify itself for anything still sitting at status "Pending" —
// the Prisma query above never sees these.
async function fetchPendingMetaobjects(admin) {
  const results = [];
  let after = null;

  for (let page = 0; page < 10; page++) {
    const resp = await admin.graphql(
      `#graphql
      query PendingClassMetaobjects($after: String) {
        metaobjects(type: "class_submission", first: 50, after: $after, sortKey: "updated_at", reverse: true) {
          edges {
            node {
              id
              handle
              fields { key value }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { variables: { after } },
    );
    const json = await resp.json();
    const edges = json?.data?.metaobjects?.edges || [];

    for (const edge of edges) {
      const f = {};
      for (const field of edge.node.fields) f[field.key] = field.value;
      if (f.status === "Pending") {
        results.push({
          id: edge.node.id,
          handle: edge.node.handle,
          classTitle: f.class_title || "(untitled)",
          instructorName: f.instructor_name || "",
          locationCity: f.location_city || "",
          locationState: f.location_state || "",
          startDate: f.start_date || "",
          submittedByName: f.submitted_by_name || "",
          submittedByEmail: f.submitted_by_email || "",
          cost: f.cost || "",
          format: f.format || "",
          topics: f.topics || "",
        });
      }
    }

    const pageInfo = json?.data?.metaobjects?.pageInfo;
    if (!pageInfo?.hasNextPage) break;
    after = pageInfo.endCursor;
  }

  return results;
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

  const { admin } = await authenticate.admin(request);

  const pendingMetaobjects = await fetchPendingMetaobjects(admin);

  const pending = await prisma.classSubmission.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });

  const recentlyApproved = await prisma.classSubmission.findMany({
    where: { status: "APPROVED" },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });

  return { pending, pendingMetaobjects, recentlyApproved, shop: ctx.shop, host: ctx.host };
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

  if (intent === "reject") {
    await prisma.classSubmission.update({
      where: { id },
      data: { status: "REJECTED" },
    });
    return { ok: true, message: "Submission rejected." };
  }

  if (intent === "approve") {
    const submission = await prisma.classSubmission.findUnique({ where: { id } });

    if (!submission) {
      return { ok: false, error: "Submission not found." };
    }

    const handle = `${slugify(submission.classTitle)}-${id.slice(-6)}`;

    const locationParts = [
      submission.locationCity,
      submission.locationState,
      submission.locationCountry,
    ].filter(Boolean);

    const fields = [
      { key: "external_id", value: handle },
      { key: "class_title", value: submission.classTitle },
      { key: "class_description", value: toRichTextJSON(submission.description) },
      { key: "instructor_name", value: submission.instructorName || submission.submittedByName },
      { key: "instructor_email", value: submission.instructorEmail || "" },
      { key: "format", value: formatEnumForShopify(submission.format) },
      { key: "location_city", value: submission.locationCity },
      { key: "location_state", value: submission.locationState },
      { key: "location_country", value: submission.locationCountry || "" },
      {
        key: "start_date",
        value: submission.startDate ? new Date(submission.startDate).toISOString() : "",
      },
      {
        key: "end_date",
        value: submission.endDate ? new Date(submission.endDate).toISOString() : "",
      },
      { key: "cost", value: submission.cost },
      { key: "registration_url", value: submission.classUrl || "" },
      { key: "topics", value: formatEnumForShopify(submission.topic) },
      { key: "skill_level", value: formatEnumForShopify(submission.skillLevel) },
      { key: "submitted_by_name", value: submission.submittedByName },
      { key: "submitted_by_email", value: submission.submittedByEmail },
      { key: "status", value: "Approved" },
    ];

    const cleanedFields = fields.filter(
      (f) => typeof f.value === "string" && f.value.trim().length > 0
    );

    const variables = {
      handle: { type: "class_submission", handle },
      metaobject: {
        fields: cleanedFields,
        capabilities: { publishable: { status: "ACTIVE" } },
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

    await prisma.classSubmission.update({
      where: { id },
      data: { status: "APPROVED" },
    });

    return { ok: true, message: "Submission approved and published to Shopify." };
  }

  if (intent === "approveMetaobjects") {
    const handlesRaw = fd.get("handles") || "";
    const handles = handlesRaw
      .toString()
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);

    if (!handles.length) {
      return { ok: false, error: "No submissions selected to approve." };
    }

    const failures = [];
    let succeeded = 0;

    for (const handle of handles) {
      const variables = {
        handle: { type: "class_submission", handle },
        metaobject: {
          fields: [{ key: "status", value: "Approved" }],
          capabilities: { publishable: { status: "ACTIVE" } },
        },
      };

      const resp = await admin.graphql(METAOBJECT_UPSERT, { variables });
      const json = await resp.json();
      const userErrors = json?.data?.metaobjectUpsert?.userErrors || [];

      if (userErrors.length) {
        failures.push(`${handle}: ${userErrors.map((e) => e.message).join("; ")}`);
      } else {
        succeeded++;
      }
    }

    if (failures.length) {
      return {
        ok: succeeded > 0,
        error: `Approved ${succeeded} of ${handles.length}. Failures: ${failures.join(" | ")}`,
      };
    }

    return {
      ok: true,
      message: `Approved and published ${succeeded} submission${succeeded !== 1 ? "s" : ""}.`,
    };
  }

  return { ok: false, error: "Unknown intent." };
};

export default function ReviewClasses() {
  const { pending, pendingMetaobjects, recentlyApproved, shop, host } = useLoaderData();
  const actionData = useActionData();
  const nav = useNavigation();
  const fetcher = useFetcher();

  const busy = nav.state !== "idle" || fetcher.state !== "idle";
  const search = typeof window !== "undefined" ? window.location.search : "";
  const actionUrl = `/app/review-classes${search}`;

  const formatLocation = (s) => [s.locationCity, s.locationState, s.locationCountry].filter(Boolean).join(", ");

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
                  Submitted by: <s-text emphasis="bold">{s.submittedByName} ({s.submittedByEmail})</s-text>
                  <br />
                  Instructor: <s-text emphasis="bold">{s.instructorName || "Not specified"}{s.instructorEmail ? ` (${s.instructorEmail})` : ""}</s-text>
                  <br />
                  Location: <s-text emphasis="bold">{formatLocation(s)}</s-text>
                  <br />
                  Start date: <s-text emphasis="bold">
                    {s.startDate ? new Date(s.startDate).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" }) : "Unknown"}
                  </s-text>
                  {s.endDate && (
                    <><br />End date: <s-text emphasis="bold">{new Date(s.endDate).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" })}</s-text></>
                  )}
                  <br />
                  Format: <s-text emphasis="bold">{s.format?.replace(/_/g, " ")}</s-text>
                  <br />
                  Cost: <s-text emphasis="bold">{s.cost}</s-text>
                  <br />
                  Topic: <s-text emphasis="bold">{s.topic?.replace(/_/g, " ") || "Not specified"}</s-text>
                  <br />
                  Skill level: <s-text emphasis="bold">{s.skillLevel?.replace(/_/g, " ") || "Not specified"}</s-text>
                  {s.classUrl && (<><br />URL: <s-text emphasis="bold">{s.classUrl}</s-text></>)}
                  {s.description && (<><br />Description: <s-text>{s.description}</s-text></>)}
                  <br />
                  Submitted: <s-text>{new Date(s.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" })}</s-text>
                </s-paragraph>

                <s-stack direction="inline" gap="tight">
                  <fetcher.Form method="post" action={actionUrl}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="intent" value="approve" />
                    <input type="hidden" name="shop" value={shop || ""} />
                    <input type="hidden" name="host" value={host || ""} />
                    <s-button type="submit" variant="primary" {...(busy ? { loading: true } : {})}>
                      Approve and publish
                    </s-button>
                  </fetcher.Form>

                  <fetcher.Form method="post" action={actionUrl}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="intent" value="reject" />
                    <input type="hidden" name="shop" value={shop || ""} />
                    <input type="hidden" name="host" value={host || ""} />
                    <s-button type="submit" variant="secondary" {...(busy ? { loading: true } : {})}>
                      Reject
                    </s-button>
                  </fetcher.Form>
                </s-stack>
              </s-section>
            ))}
          </s-stack>
        )}
      </s-section>

      <s-section heading={`Pending from CSV import (${pendingMetaobjects.length})`}>
        {pendingMetaobjects.length === 0 ? (
          <s-paragraph>No pending CSV-imported classes.</s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            <fetcher.Form method="post" action={actionUrl}>
              <input
                type="hidden"
                name="handles"
                value={pendingMetaobjects.map((m) => m.handle).join(",")}
              />
              <input type="hidden" name="intent" value="approveMetaobjects" />
              <input type="hidden" name="shop" value={shop || ""} />
              <input type="hidden" name="host" value={host || ""} />
              <s-button type="submit" variant="primary" {...(busy ? { loading: true } : {})}>
                Approve all ({pendingMetaobjects.length})
              </s-button>
            </fetcher.Form>

            {pendingMetaobjects.map((m) => (
              <s-section key={m.id} heading={m.classTitle}>
                <s-paragraph>
                  Submitted by: <s-text emphasis="bold">{m.submittedByName} ({m.submittedByEmail})</s-text>
                  <br />
                  Instructor: <s-text emphasis="bold">{m.instructorName || "Not specified"}</s-text>
                  <br />
                  Location: <s-text emphasis="bold">{[m.locationCity, m.locationState].filter(Boolean).join(", ")}</s-text>
                  <br />
                  Start date: <s-text emphasis="bold">
                    {m.startDate ? new Date(m.startDate).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" }) : "Unknown"}
                  </s-text>
                  <br />
                  Format: <s-text emphasis="bold">{m.format}</s-text>
                  <br />
                  Cost: <s-text emphasis="bold">{m.cost}</s-text>
                  {m.topics && (<><br />Topic: <s-text emphasis="bold">{m.topics}</s-text></>)}
                </s-paragraph>

                <fetcher.Form method="post" action={actionUrl}>
                  <input type="hidden" name="handles" value={m.handle} />
                  <input type="hidden" name="intent" value="approveMetaobjects" />
                  <input type="hidden" name="shop" value={shop || ""} />
                  <input type="hidden" name="host" value={host || ""} />
                  <s-button type="submit" variant="primary" {...(busy ? { loading: true } : {})}>
                    Approve and publish
                  </s-button>
                </fetcher.Form>
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
                  Instructor: <s-text emphasis="bold">{s.instructorName || s.submittedByName}</s-text>
                  <br />
                  Submitted by: <s-text emphasis="bold">{s.submittedByName} ({s.submittedByEmail})</s-text>
                  <br />
                  Approved: <s-text>{new Date(s.updatedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" })}</s-text>
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
