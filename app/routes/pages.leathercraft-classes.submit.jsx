import { useState } from "react";

export default function PublicClassSubmit() {
  const [submittedByName, setSubmittedByName] = useState("");
  const [submittedByEmail, setSubmittedByEmail] = useState("");

  const [classTitle, setClassTitle] = useState("");
  const [classDescription, setClassDescription] = useState("");
  const [instructorName, setInstructorName] = useState("");
  const [format, setFormat] = useState("In-Person");

  const [locationCity, setLocationCity] = useState("");
  const [locationState, setLocationState] = useState("");

  const [startDate, setStartDate] = useState("");
  const [cost, setCost] = useState("");
  const [registrationUrl, setRegistrationUrl] = useState("");
  const [topics, setTopics] = useState("");

  const [status, setStatus] = useState("idle"); // idle | submitting | success | error
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("submitting");
    setError("");
    setSuccessMsg("");

    try {
      const payload = {
        submitted_by_name: submittedByName.trim(),
        submitted_by_email: submittedByEmail.trim(),
        class_title: classTitle.trim(),
        class_description: classDescription.trim(),
        instructor_name: instructorName.trim(),
        format: format.trim(),
        location_city: locationCity.trim(),
        location_state: locationState.trim(),
        start_date: startDate.trim(),
        cost: cost.trim(),
        registration_url: registrationUrl.trim(),
        topics: topics.trim(),
      };

      const resp = await fetch("/api/class-submissions/single", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await resp.json().catch(() => null);

      if (!resp.ok || !json?.ok) {
        const msg =
          json?.error ||
          json?.message ||
          `Submission failed (HTTP ${resp.status}).`;
        throw new Error(msg);
      }

      setStatus("success");
      setSuccessMsg(
        "Thanks. Your class has been submitted for review and should appear after approval."
      );

      // Clear form
      setClassTitle("");
      setClassDescription("");
      setInstructorName("");
      setFormat("In-Person");
      setLocationCity("");
      setLocationState("");
      setStartDate("");
      setCost("");
      setRegistrationUrl("");
      setTopics("");
    } catch (err) {
      setStatus("error");
      setError(err?.message || "Something went wrong.");
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Submit a Leathercraft Class</h1>
      <p style={{ marginTop: 0, color: "#555" }}>
        Share a class happening in your area. Submissions are reviewed before they appear publicly.
      </p>

      {status === "success" ? (
        <div
          style={{
            border: "1px solid #c7f0d8",
            background: "#f3fffa",
            padding: 14,
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          {successMsg}
        </div>
      ) : null}

      {status === "error" ? (
        <div
          style={{
            border: "1px solid #ffd2d2",
            background: "#fff5f5",
            padding: 14,
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      ) : null}

      <form onSubmit={handleSubmit}>
        <fieldset style={{ border: "1px solid #eee", borderRadius: 8, padding: 16 }}>
          <legend style={{ padding: "0 6px" }}>Submitted by</legend>

          <label style={{ display: "block", marginBottom: 6 }}>
            Name (required)
            <input
              value={submittedByName}
              onChange={(e) => setSubmittedByName(e.target.value)}
              required
              style={{ width: "100%", padding: 10, marginTop: 6 }}
            />
          </label>

          <label style={{ display: "block" }}>
            Email (required)
            <input
              value={submittedByEmail}
              onChange={(e) => setSubmittedByEmail(e.target.value)}
              required
              type="email"
              style={{ width: "100%", padding: 10, marginTop: 6 }}
            />
          </label>
        </fieldset>

        <div style={{ height: 12 }} />

        <fieldset style={{ border: "1px solid #eee", borderRadius: 8, padding: 16 }}>
          <legend style={{ padding: "0 6px" }}>Class details</legend>

          <label style={{ display: "block", marginBottom: 10 }}>
            Class title (required)
            <input
              value={classTitle}
              onChange={(e) => setClassTitle(e.target.value)}
              required
              style={{ width: "100%", padding: 10, marginTop: 6 }}
            />
          </label>

          <label style={{ display: "block", marginBottom: 10 }}>
            Description
            <textarea
              value={classDescription}
              onChange={(e) => setClassDescription(e.target.value)}
              rows={4}
              style={{ width: "100%", padding: 10, marginTop: 6 }}
            />
          </label>

          <label style={{ display: "block", marginBottom: 10 }}>
            Instructor name
            <input
              value={instructorName}
              onChange={(e) => setInstructorName(e.target.value)}
              style={{ width: "100%", padding: 10, marginTop: 6 }}
            />
          </label>

          <label style={{ display: "block", marginBottom: 10 }}>
            Format
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              style={{ width: "100%", padding: 10, marginTop: 6 }}
            >
              <option>In-Person</option>
              <option>Online</option>
              <option>Hybrid</option>
            </select>
          </label>

          <label style={{ display: "block", marginBottom: 10 }}>
            City
            <input
              value={locationCity}
              onChange={(e) => setLocationCity(e.target.value)}
              style={{ width: "100%", padding: 10, marginTop: 6 }}
            />
          </label>

          <label style={{ display: "block", marginBottom: 10 }}>
            State / Region
            <input
              value={locationState}
              onChange={(e) => setLocationState(e.target.value)}
              style={{ width: "100%", padding: 10, marginTop: 6 }}
            />
          </label>

          <label style={{ display: "block", marginBottom: 10 }}>
            Start date (required)
            <input
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              placeholder="YYYY-MM-DD"
              style={{ width: "100%", padding: 10, marginTop: 6 }}
            />
          </label>

          <label style={{ display: "block", marginBottom: 10 }}>
            Cost
            <input
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              style={{ width: "100%", padding: 10, marginTop: 6 }}
            />
          </label>

          <label style={{ display: "block", marginBottom: 10 }}>
            Registration URL
            <input
              value={registrationUrl}
              onChange={(e) => setRegistrationUrl(e.target.value)}
              type="url"
              style={{ width: "100%", padding: 10, marginTop: 6 }}
            />
          </label>

          <label style={{ display: "block" }}>
            Topics (comma-separated)
            <input
              value={topics}
              onChange={(e) => setTopics(e.target.value)}
              style={{ width: "100%", padding: 10, marginTop: 6 }}
            />
          </label>
        </fieldset>

        <div style={{ height: 12 }} />

        <button
          type="submit"
          disabled={status === "submitting"}
          style={{
            padding: "12px 16px",
            borderRadius: 8,
            border: "1px solid #111",
            background: status === "submitting" ? "#eee" : "#111",
            color: status === "submitting" ? "#555" : "#fff",
            cursor: status === "submitting" ? "not-allowed" : "pointer",
            width: "100%",
            fontSize: 16,
          }}
        >
          {status === "submitting" ? "Submitting…" : "Submit for review"}
        </button>
      </form>

      <p style={{ marginTop: 12, color: "#777", fontSize: 13 }}>
        Note: Submissions are reviewed to prevent spam and duplicates.
      </p>
    </div>
  );
}
