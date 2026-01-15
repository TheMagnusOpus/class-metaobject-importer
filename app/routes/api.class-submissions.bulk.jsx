import { json } from "@shopify/remix-oxygen"; // if this import fails, tell me and we will swap to "@remix-run/node"
import prisma from "../db.server";

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function getClientIp(request) {
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
  if (!secret) return { ok: false, reason: "Turnstile secret missing on server" };
  if (!token) return { ok: false, reason: "Missing Turnstile token" };

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

function normalizeRow(row) {
  // row is expected to have keys matching the UI
  return {
    submittedByName: String(row?.submittedByName || "").trim(),
    submittedByEmail: String(row?.submittedByEmail || "").trim(),
    classTitle: String(row?.classTitle || "").trim(),
    classUrl: row?.classUrl ? String(row.classUrl).trim() : null,
    description: row?.description ? String(row.description).trim() : null,
    cost: String(row?.cost || "").trim(),
    format: String(row?.format || "").trim(),
    locationCity: String(row?.locationCity || "").trim(),
    locationState: String(row?.locationState || "").trim(),
    startDateRaw: String(row?.startDate || "").trim(), // YYYY-MM-DD
    topic: String(row?.topic || "").trim(),
  };
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

  if (payload?.hp && String(payload.hp).trim().length > 0) {
    return json({ ok: true }, { status: 200, headers });
  }

  const turnstile = await verifyTurnstile({ token: payload?.turnstileToken, request });
  if (!turnstile.ok) {
    return json({ ok: false, errors: { turnstile: turnstile.reason } }, { status: 400, headers });
  }

  const batchName = String(payload?.batch?.submittedByName || "").trim();
  const batchEmail = String(payload?.batch?.submittedByEmail || "").trim();

  const rows = Array.isArray(payload?.classes) ? payload.classes : [];
  if (!batchName) return json({ ok: false, errors: { submittedByName: "Required" } }, { status: 400, headers });
  if (!batchEmail || !isValidEmail(batchEmail)) {
    return json({ ok: false, errors: { submittedByEmail: "Valid email required" } }, { status: 400, headers });
  }

  if (rows.length < 1) {
    return json({ ok: false, errors: { classes: "No rows provided" } }, { status: 400, headers });
  }

  if (rows.length > 100) {
    return json({ ok: false, errors: { classes: "Max 100 rows per upload" } }, { status: 400, headers });
  }

  const rowErrors = [];
  const normalized = [];

  rows.forEach((r, idx) => {
    const n = normalizeRow(r);
    const e = {};

    if (!n.submittedByName) e.submittedByName = "Required";
    if (!n.submittedByEmail || !isValidEmail(n.submittedByEmail)) e.submittedByEmail = "Valid email required";
    if (!n.classTitle) e.classTitle = "Required";
    if (!n.cost) e.cost = "Required";
    if (!n.format) e.format = "Required";
    if (!n.locationCity) e.locationCity = "Required";
    if (!n.locationState) e.locationState = "Required";
    if (!n.startDateRaw) e.startDate = "Required";
    if (!n.topic) e.topic = "Required";

    let startDate;
    if (n.startDateRaw) {
      const d = new Date(`${n.startDateRaw}T00:00:00.000Z`);
      if (Number.isNaN(d.getTime())) e.startDate = "Invalid date";
      else startDate = d;
    }

    if (Object.keys(e).length) {
      rowErrors.push({ row: idx + 1, errors: e });
    } else {
      normalized.push({
        submittedByName: n.submittedByName,
        submittedByEmail: n.submittedByEmail,
        classTitle: n.classTitle,
        classUrl: n.classUrl,
        description: n.description,
        cost: n.cost,
        format: n.format,
        locationCity: n.locationCity,
        locationState: n.locationState,
        startDate,
        topic: n.topic,
      });
    }
  });

  if (rowErrors.length) {
    return json({ ok: false, rowErrors }, { status: 400, headers });
  }

  const batch = await prisma.submissionBatch.create({
    data: {
      submittedByName: batchName,
      submittedByEmail: batchEmail,
      status: "PENDING",
    },
  });

  await prisma.classSubmission.createMany({
    data: normalized.map((n) => ({
      ...n,
      status: "PENDING",
      batchId: batch.id,
    })),
  });

  return json({ ok: true, batchId: batch.id, count: normalized.length }, { status: 200, headers });
}
