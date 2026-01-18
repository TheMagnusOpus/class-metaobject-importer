export const config = { runtime: "server" };

// app/routes/api.class-submissions.bulk.jsx
import { PrismaClient } from "@prisma/client";

const prisma =
  globalThis.__prisma ||
  new PrismaClient({
    log: ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}

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
  return json({ ok: true, route: "api.class-submissions.bulk" });
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

  const submittedByName = String(body.submittedByName || "").trim();
  const submittedByEmail = String(body.submittedByEmail || "").trim();

  // Expect rows to be an array of objects
  const rows = Array.isArray(body.rows) ? body.rows : null;

  if (!submittedByName || !submittedByEmail || !rows || rows.length === 0) {
    return json(
      {
        ok: false,
        error: "Missing required fields: submittedByName, submittedByEmail, rows[]",
      },
      { status: 400 }
    );
  }

  // Map rows into Prisma createMany format
  const classCreates = rows
    .map((r) => {
      const classTitle = String(r.classTitle || "").trim();
      if (!classTitle) return null;

      return {
        submittedByName,
        submittedByEmail,
        classTitle,
        classUrl: r.classUrl ? String(r.classUrl).trim() : null,
        description: r.description ? String(r.description).trim() : null,
        cost: String(r.cost || "Unknown").trim(),
        format: r.format || "ONLINE",
        locationCity: String(r.locationCity || "Unknown").trim(),
        locationState: String(r.locationState || "Unknown").trim(),
        startDate: r.startDate ? new Date(r.startDate) : new Date(),
        topic: r.topic || "BEGINNER",
        status: "PENDING",
      };
    })
    .filter(Boolean);

  if (classCreates.length === 0) {
    return json({ ok: false, error: "No valid rows found (classTitle required)." }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const batch = await tx.submissionBatch.create({
        data: {
          submittedByName,
          submittedByEmail,
          status: "PENDING",
        },
        select: { id: true, createdAt: true },
      });

      // Attach to batch
      const created = await tx.classSubmission.createMany({
        data: classCreates.map((c) => ({ ...c, batchId: batch.id })),
      });

      return { batch, createdCount: created.count };
    });

    return json({
      ok: true,
      batchId: result.batch.id,
      createdAt: result.batch.createdAt,
      createdCount: result.createdCount,
    });
  } catch (e) {
    return json(
      {
        ok: false,
        error: "Failed to create bulk submissions",
        details: String(e?.message || e),
      },
      { status: 500 }
    );
  }
}
