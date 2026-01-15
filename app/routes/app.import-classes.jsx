import Papa from "papaparse";
import {
  useActionData,
  useNavigation,
  useRouteError,
  redirect,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

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

function buildExternalId(row) {
  if (row.external_id) return row.external_id.toString().trim();

  const title = slugify(row.class_title);
  const instructor = slugify(row.instructor_name);
  const date =
    (row.start_date ?? "").toString().trim().slice(0, 10) || "no-date";
  const fallback = [title, instructor, date].filter(Boolean).join("-");
  return fallback || `class-${Date.now()}`;
}

function normalizeStatus(s) {
  const v = (s ?? "").toString().trim();
  if (!v) return "Pending";
  const lowered = v.toLowerCase();
  if (lowered === "approved") return "Approved";
  if (lowered === "pending") return "Pending";
  if (lowered === "rejected") return "Rejected";
  return v;
}

function coerceISODateTime(v) {
  const raw = (v ?? "").toString().trim();
  if (!raw) return "";

  // Keep ISO values.
  if (raw.includes("T")) return raw;

  // Try MM/DD/YYYY or MM/DD/YY
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*$/);
  if (m) {
    const mm = m[1].padStart(2, "0");
    const dd = m[2].padStart(2, "0");
    let yyyy = m[3];
    if (yyyy.length === 2) yyyy = `20${yyyy}`;
    // Noon local to avoid timezone surprises
    return `${yyyy}-${mm}-${dd}T12:00:00`;
  }

  return raw;
}

function looksLikeEmail(email) {
  const e = (email ?? "").toString().trim();
  if (!e) return false;
  // Simple, practical validation (enough for form hygiene)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
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

// IMPORTANT: loader for GET requests.
// Also: ensure shop/host exist BEFORE authenticate.admin (prevents {shop: null} issues).
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
  return { shop: ctx.shop, host: ctx.host };
};

export const action = async ({ request }) => {
  console.log("import-classes action hit:", request.method, request.url);

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

  const formData = await request.formData();
  const file = formData.get("csv_file");

  if (!file || typeof file === "string") {
    return { ok: false, imported: 0, errors: ["Please upload a CSV file."] };
  }

  const csvText = await file.text();

  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors?.length) {
    return {
      ok: false,
      imported: 0,
      errors: parsed.errors.map((e) => `CSV parse error: ${e.message}`),
    };
  }

  const rows = Array.isArray(parsed.data) ? parsed.data : [];
  if (!rows.length) {
    return { ok: false, imported: 0, errors: ["No rows found in CSV."] };
  }

  const errors = [];
  let imported = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || {};

    const classTitle = (row.class_title ?? "").toString().trim();
    if (!classTitle) {
      errors.push(`Row ${i + 1}: class_title is required.`);
      continue;
    }

    const startDateISO = coerceISODateTime(row.start_date);
    if (!startDateISO) {
      errors.push(`Row ${i + 1}: start_date is required.`);
      continue;
    }

    // Required submitter attribution
    const submittedByName = (row.submitted_by_name ?? "").toString().trim();
    const submittedByEmail = (row.submitted_by_email ?? "").toString().trim();

    if (!submittedByName) {
      errors.push(`Row ${i + 1}: submitted_by_name is required.`);
      continue;
    }

    if (!submittedByEmail) {
      errors.push(`Row ${i + 1}: submitted_by_email is required.`);
      continue;
    }

    if (!looksLikeEmail(submittedByEmail)) {
      errors.push(`Row ${i + 1}: submitted_by_email must be a valid email.`);
      continue;
    }

    const externalId = buildExternalId(row);

    const fields = [
      { key: "external_id", value: externalId },
      { key: "class_title", value: classTitle },
      { key: "class_description", value: toRichTextJSON(row.class_description) },
      {
        key: "instructor_name",
        value: (row.instructor_name ?? "").toString().trim(),
      },
      { key: "format", value: (row.format ?? "").toString().trim() },
      {
        key: "location_city",
        value: (row.location_city ?? "").toString().trim(),
      },
      {
        key: "location_state",
        value: (row.location_state ?? "").toString().trim(),
      },
      { key: "start_date", value: startDateISO },
      { key: "cost", value: (row.cost ?? "").toString().trim() },
      {
        key: "registration_url",
        value: (row.registration_url ?? "").toString().trim(),
      },
      { key: "topics", value: (row.topics ?? "").toString().trim() },

      // Attribution fields
      { key: "submitted_by_name", value: submittedByName },
      { key: "submitted_by_email", value: submittedByEmail },

      // Default to Pending unless explicitly set
      { key: "status", value: normalizeStatus(row.status) || "Pending" },
    ];

    const cleanedFields = fields.filter(
      (f) => typeof f.value === "string" && f.value.trim().length > 0,
    );

    const variables = {
      handle: { type: "class_submission", handle: externalId },
      metaobject: { fields: cleanedFields },
    };

    const resp = await admin.graphql(METAOBJECT_UPSERT, { variables });
    const json = await resp.json();

    const userErrors = json?.data?.metaobjectUpsert?.userErrors || [];
    if (userErrors.length) {
      errors.push(
        `Row ${i + 1}: ${userErrors.map((e) => e.message).join("; ")}`,
      );
      continue;
    }

    imported++;
  }

  return { ok: errors.length === 0, imported, errors };
};

export default function ImportClasses() {
  const data = useActionData();
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  return (
    <s-page heading="Import classes (CSV)">
      <s-section heading="Upload CSV">
        <s-paragraph>
          Upload a CSV to create or update class submissions. New imports should
          be Pending until approved.
        </s-paragraph>

        <s-paragraph>
          For community submissions, these fields are required:
          <br />
          <s-text emphasis="bold">submitted_by_name</s-text> and{" "}
          <s-text emphasis="bold">submitted_by_email</s-text>
        </s-paragraph>

        <form method="post" encType="multipart/form-data">
          <s-stack direction="block" gap="base">
            <input type="file" name="csv_file" accept=".csv,text/csv" required />
            <s-button
              type="submit"
              variant="primary"
              {...(busy ? { loading: true } : {})}
            >
              Import CSV
            </s-button>
          </s-stack>
        </form>

        {typeof data?.imported === "number" ? (
          <s-paragraph>
            Imported or updated:{" "}
            <s-text emphasis="bold">{data.imported}</s-text>
          </s-paragraph>
        ) : null}

        {data?.errors?.length ? (
          <s-section heading="Errors">
            <s-unordered-list>
              {data.errors.slice(0, 20).map((e, idx) => (
                <s-list-item key={idx}>{e}</s-list-item>
              ))}
            </s-unordered-list>
            {data.errors.length > 20 ? (
              <s-paragraph>Showing first 20 errors.</s-paragraph>
            ) : null}
          </s-section>
        ) : null}
      </s-section>

      <s-section slot="aside" heading="CSV headers">
        <s-paragraph>
          external_id, class_title, class_description, instructor_name, format,
          location_city, location_state, start_date, cost, registration_url,
          topics, status, submitted_by_name, submitted_by_email
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
