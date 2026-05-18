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

async function sendNotificationEmail(submission) {
  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.NOTIFICATION_EMAIL;

  if (!apiKey || !toEmail) return;

  const startDate = submission.startDate
    ? new Date(submission.startDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Not specified";

  const endDate = submission.endDate
    ? new Date(submission.endDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  const html = `
    <h2>New Class Submission: ${submission.classTitle}</h2>
    <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
      <tr><td style="padding: 6px 12px; font-weight: bold; background: #f5f5f5;">Submitted by</td><td style="padding: 6px 12px;">${submission.submittedByName} (${submission.submittedByEmail})</td></tr>
      <tr><td style="padding: 6px 12px; font-weight: bold; background: #f5f5f5;">Instructor</td><td style="padding: 6px 12px;">${submission.instructorName || "Not specified"}${submission.instructorEmail ? ` (${submission.instructorEmail})` : ""}</td></tr>
      <tr><td style="padding: 6px 12px; font-weight: bold; background: #f5f5f5;">Format</td><td style="padding: 6px 12px;">${submission.format?.replace(/_/g, " ") || "Not specified"}</td></tr>
      <tr><td style="padding: 6px 12px; font-weight: bold; background: #f5f5f5;">Location</td><td style="padding: 6px 12px;">${submission.locationCity}, ${submission.locationState}</td></tr>
      <tr><td style="padding: 6px 12px; font-weight: bold; background: #f5f5f5;">Start date</td><td style="padding: 6px 12px;">${startDate}</td></tr>
      ${endDate ? `<tr><td style="padding: 6px 12px; font-weight: bold; background: #f5f5f5;">End date</td><td style="padding: 6px 12px;">${endDate}</td></tr>` : ""}
      <tr><td style="padding: 6px 12px; font-weight: bold; background: #f5f5f5;">Cost</td><td style="padding: 6px 12px;">${submission.cost}</td></tr>
      <tr><td style="padding: 6px 12px; font-weight: bold; background: #f5f5f5;">Topic</td><td style="padding: 6px 12px;">${submission.topic?.replace(/_/g, " ") || "Not specified"}</td></tr>
      <tr><td style="padding: 6px 12px; font-weight: bold; background: #f5f5f5;">Skill level</td><td style="padding: 6px 12px;">${submission.skillLevel?.replace(/_/g, " ") || "Not specified"}</td></tr>
      ${submission.classUrl ? `<tr><td style="padding: 6px 12px; font-weight: bold; background: #f5f5f5;">URL</td><td style="padding: 6px 12px;"><a href="${submission.classUrl}">${submission.classUrl}</a></td></tr>` : ""}
      ${submission.description ? `<tr><td style="padding: 6px 12px; font-weight: bold; background: #f5f5f5;">Description</td><td style="padding: 6px 12px;">${submission.description}</td></tr>` : ""}
    </table>
    <p style="margin-top: 24px;">
      <a href="https://learnleathercraft.myshopify.com/admin/apps/ll-class-submissions-1/app/review-classes" style="background: #2c6fad; color: white; padding: 10px 16px; border-radius: 6px; text-decoration: none; font-weight: bold;">Review submission</a>
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
        subject: `New class submission: ${submission.classTitle}`,
        html,
      }),
    });
  } catch (e) {
    console.error("Failed to send notification email:", e);
  }
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
    });

    // Send notification email (non-blocking — won't fail the submission if email fails)
    sendNotificationEmail(created).catch(() => {});

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
