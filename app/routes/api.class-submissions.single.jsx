// app/routes/api.class-submissions.single.jsx
import prisma from "../db.server";

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

async function verifyTurnstileIfConfigured(turnstileToken) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true, skipped: true };

  if (!turnstileToken) {
    return { ok: false, error: "Missing Turnstile token." };
  }

  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", turnstileToken);

  const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const data = await resp.json().catch(() => null);
  if (!data?.success) {
    return { ok: false, error: "Turnstile verification failed.", details: data || null };
  }

  return { ok: true };
}

export async function loader() {
  return json({ ok: true, route: "api.class-submissions.single" });
}

export async function action({ request }) {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const turnstileToken =
    body.turnstileToken || body.turnstile || body["cf-turnstile-response"] || null;

  const turnstile = await verifyTurnstileIfConfigured(turnstileToken);
  if (!turnstile.ok) {
    return json({ ok: false, error: turnstile.error, details: turnstile.details || null }, { status: 400 });
  }

  // Required fields
  const submittedByName = String(body.submittedByName || "").trim();
  const submittedByEmail = String(body.submittedByEmail || "").trim();
  const instructorName = String(body.instructorName || "").trim();
  const classTitle = String(body.classTitle || "").trim();

  if (!submittedByName || !submittedByEmail || !instructorName || !classTitle) {
    return json(
      {
        ok: false,
        error: "Missing required fields: submittedByName, submittedByEmail, instructorName, classTitle",
      },
      { status: 400 }
    );
  }

  try {
    const created = await prisma.classSubmission.create({
      data: {
        submittedByName,
        submittedByEmail,
        instructorName,
        instructorEmail: body.instructorEmail ? String(body.instructorEmail).trim() : null,
        classTitle,
        classUrl: body.classUrl ? String(body.classUrl).trim() : null,
        description: body.description ? String(body.description).trim() : null,
        cost: String(body.cost || "Unknown").trim(),
        format: body.format || "ONLINE",
        locationCity: String(body.locationCity || "Unknown").trim(),
        locationState: String(body.locationState || "Unknown").trim(),
        startDate: body.startDate ? new Date(body.startDate) : new Date(),
        endDate: body.endDate ? new Date(body.endDate) : null,
        topic: body.topic || null,
        skillLevel: body.skillLevel || null,
        status: "PENDING",
      },
      select: { id: true, createdAt: true },
    });

    return json({ ok: true, id: created.id, createdAt: created.createdAt });
  } catch (e) {
    return json(
      {
        ok: false,
        error: "Failed to create submission",
        details: String(e?.message || e),
      },
      { status: 500 }
    );
  }
}
