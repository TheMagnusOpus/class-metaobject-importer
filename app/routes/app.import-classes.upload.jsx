// app/routes/app.import-classes.upload.jsx
// This is a RESOURCE route: no default export / UI component. That matters —
// resource routes always return exactly what the action returns, with no
// wrapping, unlike UI routes where fetches to the ".data" endpoint get
// bundled into React Router's internal turbo-stream format. This route
// exists purely so the upload button gets a clean, plain JSON response.
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

function buildExternalId(row, startDateISO) {
  if (row.external_id) return row.external_id.toString().trim();

  const title = slugify(row.class_title);
  const instructor = slugify(row.instructor_name);
  // Use the already-normalized ISO date (YYYY-MM-DD, hyphens only) instead
  // of the raw CSV value — raw dates like "11/6/2026" contain slashes,
  // which Shopify metaobject handles reject outright ("Handle is invalid").
  const date = (startDateISO || "").slice(0, 10) || "no-date";
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

  if (raw.includes("T")) return raw;

  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*$/);
  if (m) {
    const mm = m[1].padStart(2, "0");
    const dd = m[2].padStart(2, "0");
    let yyyy = m[3];
    if (yyyy.length === 2) yyyy = `20${yyyy}`;
    return `${yyyy}-${mm}-${dd}T12:00:00`;
  }

  return raw;
}

function looksLikeEmail(email) {
  const e = (email ?? "").toString().trim();
  if (!e) return false;
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

export const action = async ({ request }) => {
  console.log("import-classes UPLOAD action hit:", request.method, request.url);

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

  const formData = await request.formData();
  const file = formData.get("csv_file");

  if (!file || typeof file === "string") {
    return Response.json({ ok: false, imported: 0, errors: ["Please upload a CSV file."] });
  }

  const csvText = await file.text();

  const Papa = (await import("papaparse")).default;
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors?.length) {
    return Response.json({
      ok: false,
      imported: 0,
      errors: parsed.errors.map((e) => `CSV parse error: ${e.message}`),
    });
  }

  const rows = Array.isArray(parsed.data) ? parsed.data : [];
  if (!rows.length) {
    return Response.json({ ok: false, imported: 0, errors: ["No rows found in CSV."] });
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

    const externalId = buildExternalId(row, startDateISO);

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
      { key: "submitted_by_name", value: submittedByName },
      { key: "submitted_by_email", value: submittedByEmail },
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

  return Response.json({ ok: errors.length === 0, imported, errors });
};
