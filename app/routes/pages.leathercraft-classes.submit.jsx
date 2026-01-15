import { Form, useActionData } from "react-router";
import prisma from "../db.server";

export async function action({ request }) {
  const formData = await request.formData();

  const submittedByName = (formData.get("submittedByName") || "").toString().trim();
  const submittedByEmail = (formData.get("submittedByEmail") || "").toString().trim();
  const classTitle = (formData.get("classTitle") || "").toString().trim();
  const classUrl = (formData.get("classUrl") || "").toString().trim();

  if (!submittedByName || !submittedByEmail || !classTitle) {
    return { ok: false, message: "Please fill out name, email, and class title." };
  }

  await prisma.classSubmission.create({
    data: {
      submittedByName,
      submittedByEmail,
      classTitle,
      classUrl: classUrl || null,
      status: "PENDING",
    },
  });

  return { ok: true, message: "Submitted. Thank you. We will review it soon." };
}

export default function SubmitLeathercraftClass() {
  const result = useActionData();

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1>Submit a leathercraft class</h1>
      <p>Use this form to submit a class for review. Approved classes will be published on LearnLeathercraft.</p>

      {result?.message ? (
        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 8, margin: "16px 0" }}>
          {result.message}
        </div>
      ) : null}

      <Form method="post">
        <label style={{ display: "block", marginTop: 12 }}>
          Your name
          <input name="submittedByName" required style={{ display: "block", width: "100%", padding: 10, marginTop: 6 }} />
        </label>

        <label style={{ display: "block", marginTop: 12 }}>
          Your email
          <input name="submittedByEmail" type="email" required style={{ display: "block", width: "100%", padding: 10, marginTop: 6 }} />
        </label>

        <label style={{ display: "block", marginTop: 12 }}>
          Class title
          <input name="classTitle" required style={{ display: "block", width: "100%", padding: 10, marginTop: 6 }} />
        </label>

        <label style={{ display: "block", marginTop: 12 }}>
          Class URL (optional)
          <input name="classUrl" style={{ display: "block", width: "100%", padding: 10, marginTop: 6 }} />
        </label>

        <button type="submit" style={{ marginTop: 16, padding: "10px 14px" }}>
          Submit
        </button>
      </Form>
    </main>
  );
}
