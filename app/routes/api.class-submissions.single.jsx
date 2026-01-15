import { json } from "@shopify/remix-oxygen"; // if this import fails, tell me and we will swap to "@remix-run/node"
import prisma from "../db.server";

// Basic email validation for MVP
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function getClientIp(request) {
  // App Runner usually forwards this header
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "unknown";
}

function corsHeaders(request) {
  const origin = request.headers.get("origin") || "";
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const headers = new Headers();
  if (allowed.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
  }
  return headers;
}

async function verifyTurnstile({ token, request }) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return { ok: false, reason: "Turnstile secret missing on server" };
  }
  if (!token) {
    return { ok: false, reason: "Missing Turnstile token" };
  }

  const ip = getClientIp(request);
  const formData = new URLSearchParams();
  formData.set("secret", secret);
  formData.set("response", token);
  if (ip && ip !== "unknown") formData.set("remoteip", ip);

  const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });

  const data = await resp.json().catch(() => null);
  if (!data?.success) return { ok: false, reason: "Turnstile verification failed" };
  return { ok: true };
}

export async function action({ request }) {
  const headers = corsHeaders(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, { status: 405, headers });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, { status: 400, headers });
  }

  // Honeypot: bots will often fill this
  if (payload?.hp && String(payload.hp).trim().length > 0) {
    return json({ ok: true }, { status: 200, headers });
  }

  // Turnstile
  const turnstile = await verifyTurnstile({ token: payload?.turnstileToken, request });
  if (!turnstile.ok) {
    return json({ ok: false, errors: { turnstile: turnstile.reason } }, { status: 400, headers });
  }

  const errors = {};

  const submittedByName = String(payload?.submittedByName || "").trim();
  const submittedByEmail = String(payload?.submittedByEmail || "").trim();
  const classTitle = String(payload?.classTitle || "").trim();
  const classUrl = payload?.classUrl ? String(payload.classUrl).trim() : null;
  const description = payload?.description ? String(payload.description).trim() : null;

  const cost = String(payload?.cost || "").trim();
  const format = String(payload?.format || "").trim(); // IN_PERSON | ONLINE | HYBRID
  const locationCity = String(payload?.locationCity || "").trim();
  const locationState = String(payload?.locationState || "").trim();
  const startDateRaw = String(payload?.startDate || "").trim(); // expect YYYY-MM-DD
  const topic = String(payload?.topic || "").trim(); // one of ClassTopic

  if (!submittedByName) errors.submittedByName = "Required";
  if (!submittedByEmail || !isValidEmail(submittedByEmail)) errors.submittedByEmail = "Valid email required";
  if (!classTitle) errors.classTitle = "Required";
  if (!cost) errors.cost = "Required";
  if (!format) errors.format = "Required";
  if (!locationCity) errors.locationCity = "Required";
  if (!locationState) errors.locationState = "Required";
  if (!startDateRaw) errors.startDate = "Required";
  if (!topic) errors.topic = "Required";

  // parse date
  let startDate;
  if (startDateRaw) {
    const d = new Date(`${startDateRaw}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) errors.startDate = "Invalid date";
    else startDate = d;
  }

  if (Object.keys(errors).length) {
    return json({ ok: false, errors }, { status: 400, headers });
  }

  const row = await prisma.classSubmission.create({
    data: {
      submittedByName,
      submittedByEmail,
      classTitle,
      classUrl,
      description,
      cost,
      format, // Prisma enum
      locationCity,
      locationState,
      startDate,
      topic, // Prisma enum
      status: "PENDING",
      batchId: null,
    },
  });

  return json({ ok: true, id: row.id }, { status: 200, headers });
}
