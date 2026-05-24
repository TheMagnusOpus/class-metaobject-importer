// app/routes/api.class-submissions.bulk.jsx
import prisma from "../db.server";

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

async function sendBulkNotificationEmail(submittedByName, submittedByEmail, createdCount, batchId) {
  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.NOTIFICATION_EMAIL;

  if (!apiKey || !toEmail) return;

  const html = `
    <h2>New Bulk Class Submission</h2>
    <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
      <tr><td style="padding: 6px 12px; font-weight: bold; background: #f5f5f5;">Submitted by</td><td style="padding: 6px 12px;">${submittedByName} (${submittedByEmail})</td></tr>
      <tr><td style="padding: 6px 12px; font-weight: bold; background: #f5f5f5;">Classes submitted</td><td style="padding: 6px 12px;">${createdCount}</td></tr>
      <tr><td style="padding: 6px 12px; font-weight: bold; background: #f5f5f5;">Batch ID</td><td style="padding: 6px 12px;">${batchId}</td></tr>
    </table>
    <p style="margin-top: 24px;">
      <a href="https://learnleathercraft.myshopify.com/admin/apps/ll-class-submissions-1/app/review-classes" style="background: #2c6fad; color: white; padding: 10px 16px; border-radius: 6px; text-decoration: none; font-weight: bold;">Review submissions</a>
    </p>
  `;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: "noreply@learnleathercraft.com",
        to: [toEmail],
        subject: `New bulk submission: ${createdCount} class${createdCount !== 1 ? "es" : ""} uploaded by ${submittedByName}`,
        html,
      }),
    });
  } catch (e) {
    console.error("Failed to send bulk notification email:", e);
  }
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

  const partnerKey = body.partnerKey || "";
  const validKeys = (process.env.BULK_UPLOAD_KEYS || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  if (!partnerKey || !validKeys.includes(partnerKey)) {
    return json({ ok: false, error: "Invalid or missing partner key." }, { status: 403 });
  }

  const submittedByName = String(body.submittedByName || "").trim();
  const submittedByEmail = String(body.submittedByEmail || "").trim();
  const rows = Array.isArray(body.rows) ? body.rows : null;

  if (!submittedByName || !submittedByEmail || !rows || rows.length === 0) {
    return json(
      { ok: false, error: "Missing required fields: submittedByName, submittedByEmail, rows[]" },
      { status: 400 }
    );
  }

  const classCreates = rows
    .map((r) => {
      const classTitle = String(r.classTitle || "").trim();
      if (!classTitle) return null;

      return {
        submittedByName: String(r.submittedByName || submittedByName).trim(),
        submittedByEmail: String(r.submittedByEmail || submittedByEmail).trim(),
        instructorName: r.instructorName ? String(r.instructorName).trim() : null,
        instructorEmail: r.instructorEmail ? String(r.instructorEmail).trim() : null,
        classTitle,
        classUrl: r.classUrl ? String(r.classUrl).trim() : null,
        description: r.description ? String(r.description).trim() : null,
        cost: String(r.cost || "Unknown").trim(),
        format: r.format || "ONLINE",
        locationCity: String(r.locationCity || "Unknown").trim(),
        locationState: String(r.locationState || "Unknown").trim(),
        locationCountry: r.locationCountry ? String(r.locationCountry).trim() : null,
        startDate: r.startDate ? new Date(r.startDate) : new Date(),
        endDate: r.endDate ? new Date(r.endDate) : null,
        topic: r.topic || null,
        skillLevel: r.skillLevel || null,
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
        data: { submittedByName, submittedByEmail, status: "PENDING" },
        select: { id: true, createdAt: true },
      });

      const created = await tx.classSubmission.createMany({
        data: classCreates.map((c) => ({ ...c, batchId: batch.id })),
      });

      return { batch, createdCount: created.count };
    });

    sendBulkNotificationEmail(submittedByName, submittedByEmail, result.createdCount, result.batch.id).catch(() => {});

    return json({
      ok: true,
      batchId: result.batch.id,
      createdAt: result.batch.createdAt,
      createdCount: result.createdCount,
    });
  } catch (e) {
    return json(
      { ok: false, error: "Failed to create bulk submissions", details: String(e?.message || e) },
      { status: 500 }
    );
  }
}
