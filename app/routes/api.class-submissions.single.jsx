import { json } from "react-router";
import { shopifyApp } from "../shopify.server";
import crypto from "crypto";

const METAOBJECT_UPSERT = `#graphql
mutation MetaobjectUpsert($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
  metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
    metaobject { id handle type }
    userErrors { field message }
  }
}
`;

function corsHeaders(request) {
  const origin = request.headers.get("origin") || "";
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const ok = allowed.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : (allowed[0] || ""),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

function slugify(s) {
  return (s ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function toRichTextJSON(text) {
  const safe = (text ?? "").toString().trim();
  if (!safe) return "";
  return JSON.stringify({
    type: "root",
    children: [{ type: "paragraph", children: [{ type: "text", value: safe }] }],
  });
}

function coerceISODateTime(v) {
  const raw = (v ?? "").toString().trim();
  if (!raw) return "";

  // Keep ISO values as-is
  if (raw.includes("T")) return raw;

  // Try YYYY-MM-DD
  const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) {
    return `${raw}T12:00:00Z`;
  }

  // Try MM/DD/YYYY or MM/DD/YY
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*$/);
  if (m) {
    const mm = m[1].padStart(2, "0");
    const dd = m[2].padStart(2, "0");
    let yyyy = m[3];
    if (yyyy.length === 2) yyyy = `20${yyyy}`;
    return `${yyyy}-${mm}-${dd}T12:00:00Z`;
  }

  return raw;
}

async function verifyTurnstile({ token, ip }) {
  const secret = process.env.TURNSTILE_SECRET_KEY || "";
  if (!secret) return { ok: false, error: "TURNSTILE_SECRET_KEY is not set." };
  if (!token) return { ok: false, error: "Missing Turnstile token." };

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (ip) body.set("remoteip", ip);

  const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await resp.json().catch(() => null);
  if (!data?.success) {
    return { ok: false, error: "Turnstile verification failed." };
  }
  return { ok: true };
}

async function getAdminForPublicShop() {
  const shop = (process.env.PUBLIC_SHOP || "").trim();
  if (!shop) throw new Error("PUBLIC_SHOP is not set.");

  // Load the offline session for the shop from Prisma session storage.
  const offlineId = shopifyApp.api.session.getOfflineId(shop);
  const session = await shopifyApp.sessionStorage.loadSession(offlineId);

  if (!session?.accessToken) {
    throw new Error(
      `No offline session found for ${shop}. Reinstall the app on that store to create an offline token.`
    );
  }

  const client = new shopifyApp.api.clients.Graphql({ session });
  return { client, shop };
}

function makeExternalId({ title, instructor, startDate }) {
  const base = [
    slugify(title).slice(0, 40),
    slugify(instructor).slice(0, 30),
    (startDate || "").toString().slice(0, 10).replace(/[^0-9]/g, ""),
  ]
    .filter(Boolean)
    .join("-")
    .slice(0, 80);

  const rand = crypto.randomBytes(3).toString("hex");
  return (base || "class") + "-" + rand;
}

export const loader = async ({ request }) => {
  // CORS preflight convenience if something accidentally GETs this
  return json({ ok: false, error: "Use POST." }, { headers: corsHeaders(request), status: 405 });
};

export const action = async ({ request }) => {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  const headers = corsHeaders(request);

  try {
    const contentType = request.headers.get("content-type") || "";
    let payload = {};

    if (contentType.includes("application/json")) {
      payload = (await request.json().catch(() => ({}))) || {};
    } else {
      const fd = await request.formData();
      payload = Object.fromEntries(fd.entries());
    }

    // Basic honeypot to deter bots
    if ((payload.website || "").toString().trim()) {
      return json({ ok: false, error: "Bot detected." }, { headers, status: 400 });
    }

    const turnstileToken =
      (payload["cf-turnstile-response"] || payload.turnstileToken || "").toString().trim();

    const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "";
    const ts = await verifyTurnstile({ token: turnstileToken, ip: ip.toString().split(",")[0].trim() });
    if (!ts.ok) return json({ ok: false, error: ts.error }, { headers, status: 400 });

    // Required attribution fields
    const submittedByName = (payload.submitted_by_name || "").toString().trim();
    const submittedByEmail = (payload.submitted_by_email || "").toString().trim();

    if (!submittedByName) return json({ ok: false, error: "submitted_by_name is required." }, { headers, status: 400 });
    if (!submittedByEmail) return json({ ok: false, error: "submitted_by_email is required." }, { headers, status: 400 });

    // Required class fields (adjust if you want to allow partials)
    const classTitle = (payload.class_title || "").toString().trim();
    const startDateISO = coerceISODateTime(payload.start_date);

    if (!classTitle) return json({ ok: false, error: "class_title is required." }, { headers, status: 400 });
    if (!startDateISO) return json({ ok: false, error: "start_date is required." }, { headers, status: 400 });

    const instructor = (payload.instructor_name || "").toString().trim();
    const format = (payload.format || "").toString().trim();
    const locationCity = (payload.location_city || "").toString().trim();
    const locationState = (payload.location_state || "").toString().trim();
    const cost = (payload.cost || "").toString().trim();
    const registrationUrl = (payload.registration_url || "").toString().trim();
    const topics = (payload.topics || "").toString().trim();
    const description = toRichTextJSON(payload.class_description || "");

    const externalId =
      (payload.external_id || "").toString().trim() ||
      makeExternalId({ title: classTitle, instructor, startDate: startDateISO });

    const fields = [
      { key: "external_id", value: externalId },
      { key: "class_title", value: classTitle },
      { key: "class_description", value: description },
      { key: "instructor_name", value: instructor },
      { key: "format", value: format },
      { key: "location_city", value: locationCity },
      { key: "location_state", value: locationState },
      { key: "start_date", value: startDateISO },
      { key: "cost", value: cost },
      { key: "registration_url", value: registrationUrl },
      { key: "topics", value: topics },
      { key: "submitted_by_name", value: submittedByName },
      { key: "submitted_by_email", value: submittedByEmail },
      { key: "status", value: "Pending" },
    ].filter((f) => typeof f.value === "string" && f.value.trim().length > 0);

    const { client } = await getAdminForPublicShop();

    const variables = {
      handle: { type: "class_submission", handle: externalId },
      metaobject: { fields },
    };

    const resp = await client.query({ data: { query: METAOBJECT_UPSERT, variables } });
    const userErrors = resp?.body?.data?.metaobjectUpsert?.userErrors || [];

    if (userErrors.length) {
      return json(
        { ok: false, error: userErrors.map((e) => e.message).join("; ") },
        { headers, status: 400 }
      );
    }

    return json({ ok: true, external_id: externalId }, { headers });
  } catch (e) {
    return json(
      { ok: false, error: e?.message || "Submission failed." },
      { headers, status: 500 }
    );
  }
};
