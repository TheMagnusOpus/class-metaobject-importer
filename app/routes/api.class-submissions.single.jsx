import { authenticate } from "../shopify.server";

/**
 * PUBLIC endpoint (no admin auth):
 * - Receives a single class submission from the public form
 * - Stores it in Postgres via Prisma (ClassSubmission + SubmissionBatch optional)
 *
 * IMPORTANT:
 * This file purposely does NOT import anything that might not exist (shopifyApp/json/etc).
 * It also does NOT require Shopify admin authentication.
 */
export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return Response.json({ ok: false, error: "Expected JSON body." }, { status: 400 });
    }

    const body = await request.json();

    const submittedByName = (body?.submitted_by_name || "").trim();
    const submittedByEmail = (body?.submitted_by_email || "").trim();

    const classTitle = (body?.class_title || "").trim();
    const description = (body?.class_description || "").trim();
    const instructorName = (body?.instructor_name || "").trim();

    const formatRaw = (body?.format || "In-Person").trim();
    const locationCity = (body?.location_city || "").trim();
    const locationState = (body?.location_state || "").trim();

    const startDateRaw = (body?.start_date || "").trim();
    const cost = (body?.cost || "").trim();
    const classUrl = (body?.registration_url || "").trim();
    const topicRaw = (body?.topics || "").trim();

    // Basic required checks
    if (!submittedByName || !submittedByEmail) {
      return Response.json(
        { ok: false, error: "Submitted by name and email are required." },
        { status: 400 }
      );
    }

    if (!classTitle) {
      return Response.json({ ok: false, error: "Class title is required." }, { status: 400 });
    }

    if (!startDateRaw) {
      return Response.json({ ok: false, error: "Start date is required." }, { status: 400 });
    }

    // Map to Prisma enums
    const formatMap = {
      "In-Person": "IN_PERSON",
      "In person": "IN_PERSON",
      IN_PERSON: "IN_PERSON",
      Online: "ONLINE",
      ONLINE: "ONLINE",
      Hybrid: "HYBRID",
      HYBRID: "HYBRID",
    };

    const topicMap = {
      BEGINNER: "BEGINNER",
      TOOLING: "TOOLING",
      CARVING: "CARVING",
      DYEING: "DYEING",
      SADDLERY: "SADDLERY",
      WALLETS: "WALLETS",
      BAGS: "BAGS",
      BELTS: "BELTS",
      FIGURE_CARVING: "FIGURE_CARVING",
      BUSINESSES: "BUSINESSES",
      ASSEMBLY: "ASSEMBLY",
      COSTUMING: "COSTUMING",
    };

    const format = formatMap[formatRaw] || "IN_PERSON";
    const topic = topicMap[topicRaw.toUpperCase()] || "BEGINNER";

    // Parse start date
    // Accept YYYY-MM-DD and convert to Date
    let startDate;
    if (/^\d{4}-\d{2}-\d{2}$/.test(startDateRaw)) {
      startDate = new Date(`${startDateRaw}T00:00:00.000Z`);
    } else {
      const parsed = new Date(startDateRaw);
      if (Number.isNaN(parsed.getTime())) {
        return Response.json(
          { ok: false, error: "Invalid start_date. Use YYYY-MM-DD." },
          { status: 400 }
        );
      }
      startDate = parsed;
    }

    // Prisma
    const { prisma } = await import("../db.server");

    // Create a single submission row (batch optional for single)
    const created = await prisma.classSubmission.create({
      data: {
        submittedByName,
        submittedByEmail,
        classTitle,
        classUrl: classUrl || null,
        description: description || null,
        cost: cost || "",
        format,
        locationCity: locationCity || "",
        locationState: locationState || "",
        startDate,
        topic,
        status: "PENDING",
      },
      select: { id: true },
    });

    return Response.json({ ok: true, id: created.id });
  } catch (err) {
    return Response.json(
      { ok: false, error: err?.message || "Server error." },
      { status: 500 }
    );
  }
};

/**
 * Optional: allow GET as a simple health check.
 * Do NOT require admin auth here.
 */
export const loader = async ({ request }) => {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  return Response.json({ ok: true });
};
