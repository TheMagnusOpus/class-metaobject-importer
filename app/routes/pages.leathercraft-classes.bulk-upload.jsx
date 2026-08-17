// app/routes/pages.leathercraft-classes.bulk-upload.jsx
import React, { useState } from "react";
import { useLoaderData } from "react-router";
import Papa from "papaparse";

export async function loader({ request }) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key") || "";

  const validKeys = (process.env.BULK_UPLOAD_KEYS || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  if (!key || !validKeys.includes(key)) {
    throw new Response("Not Found", { status: 404 });
  }

  return {
    key,
    apiBaseUrl: process.env.PUBLIC_BASE_URL || "",
  };
}

const REQUIRED_COLUMNS = [
  "submittedByName",
  "submittedByEmail",
  "classTitle",
  "cost",
  "format",
  "locationCity",
  "locationState",
  "startDate",
  "topic",
];

const VALID_FORMATS = ["ONLINE", "IN_PERSON", "HYBRID"];
const VALID_TOPICS = [
  "BEGINNER", "TOOLING", "CARVING", "DYEING", "SADDLERY",
  "WALLETS", "BAGS", "BELTS", "FIGURE_CARVING", "BUSINESSES",
  "ASSEMBLY", "COSTUMING",
];

function validateRows(rows) {
  const errors = [];
  const valid = [];

  rows.forEach((row, i) => {
    const rowNum = i + 2; // +2 because row 1 is header
    const missing = REQUIRED_COLUMNS.filter((col) => !row[col]?.toString().trim());
    if (missing.length) {
      errors.push(`Row ${rowNum}: missing required fields: ${missing.join(", ")}`);
      return;
    }

    if (!VALID_FORMATS.includes(row.format?.toUpperCase())) {
      errors.push(`Row ${rowNum}: format must be one of: ${VALID_FORMATS.join(", ")}`);
      return;
    }

    if (!VALID_TOPICS.includes(row.topic?.toUpperCase())) {
      errors.push(`Row ${rowNum}: topic must be one of: ${VALID_TOPICS.join(", ")}`);
      return;
    }

    const date = new Date(row.startDate);
    if (isNaN(date.getTime())) {
      errors.push(`Row ${rowNum}: startDate is not a valid date`);
      return;
    }

    valid.push({
      submittedByName: row.submittedByName.trim(),
      submittedByEmail: row.submittedByEmail.trim(),
      classTitle: row.classTitle.trim(),
      classUrl: row.classUrl?.trim() || null,
      description: row.description?.trim() || null,
      cost: row.cost.trim(),
      format: row.format.toUpperCase(),
      locationCity: row.locationCity.trim(),
      locationState: row.locationState.trim(),
      startDate: date.toISOString(),
      topic: row.topic.toUpperCase(),
      status: "PENDING",
    });
  });

  return { valid, errors };
}

export default function BulkUpload() {
  const { key } = useLoaderData();

  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [parseErrors, setParseErrors] = useState([]);
  const [status, setStatus] = useState({ type: "idle", message: "" });
  const [results, setResults] = useState(null);

  function handleFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(null);
    setParseErrors([]);
    setResults(null);
    setStatus({ type: "idle", message: "" });

    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (parsed) => {
        if (parsed.errors?.length) {
          setParseErrors(parsed.errors.map((e) => e.message));
          return;
        }
        const { valid, errors } = validateRows(parsed.data);
        setParseErrors(errors);
        setPreview({ rows: parsed.data, valid, total: parsed.data.length });
      },
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!preview?.valid?.length) return;

    setStatus({ type: "loading", message: "Submitting…" });

    try {
      const res = await fetch("/api/class-submissions/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submittedByName: preview.valid[0].submittedByName,
          submittedByEmail: preview.valid[0].submittedByEmail,
          rows: preview.valid,
          partnerKey: key,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setStatus({
          type: "error",
          message: data?.error || `Request failed (${res.status}).`,
        });
        return;
      }

      setResults(data);
      setStatus({ type: "success", message: "" });
      setFile(null);
      setPreview(null);
    } catch (err) {
      setStatus({ type: "error", message: String(err?.message || err) });
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ marginBottom: 4 }}>Bulk Class Upload</h1>
      <p style={{ marginTop: 0, opacity: 0.7 }}>
        Partner upload portal for LearnLeathercraft.com. Submissions are reviewed before publishing.
      </p>

      <div style={{
        background: "#f8f9fa",
        border: "1px solid #e0e0e0",
        borderRadius: 8,
        padding: 16,
        marginBottom: 24,
      }}>
        <strong>CSV Format</strong>
        <p style={{ margin: "8px 0 4px", fontSize: 13 }}>Required columns:</p>
        <code style={{ fontSize: 12, display: "block", lineHeight: 1.6 }}>
          submittedByName, submittedByEmail, classTitle, cost, format, locationCity, locationState, startDate, topic
        </code>
        <p style={{ margin: "8px 0 4px", fontSize: 13 }}>Optional columns:</p>
        <code style={{ fontSize: 12 }}>classUrl, description</code>
        <p style={{ margin: "8px 0 4px", fontSize: 13 }}>Valid values:</p>
        <div style={{ fontSize: 12, lineHeight: 1.6 }}>
          <div><strong>format:</strong> ONLINE, IN_PERSON, HYBRID</div>
          <div><strong>topic:</strong> BEGINNER, TOOLING, CARVING, DYEING, SADDLERY, WALLETS, BAGS, BELTS, FIGURE_CARVING, BUSINESSES, ASSEMBLY, COSTUMING</div>
          <div><strong>startDate:</strong> Any standard date format (e.g. 2026-06-15 or 06/15/2026)</div>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <label style={{ fontWeight: 600 }}>Upload CSV file</label>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            style={{ padding: 4 }}
          />
        </div>

        {parseErrors.length > 0 && (
          <div style={{
            padding: 12,
            borderRadius: 8,
            border: "1px solid #f3c2c2",
            background: "#fff5f5",
          }}>
            <strong>Validation errors — please fix your CSV before submitting:</strong>
            <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
              {parseErrors.map((e, i) => <li key={i} style={{ fontSize: 13 }}>{e}</li>)}
            </ul>
          </div>
        )}

        {preview && parseErrors.length === 0 && (
          <div style={{
            padding: 12,
            borderRadius: 8,
            border: "1px solid #c2f3d0",
            background: "#f5fff8",
          }}>
            <strong>Preview looks good!</strong>
            <div style={{ marginTop: 6, fontSize: 13 }}>
              {preview.valid.length} valid row{preview.valid.length !== 1 ? "s" : ""} ready to submit
              {preview.total !== preview.valid.length && (
                <span style={{ color: "#c0392b" }}> ({preview.total - preview.valid.length} skipped due to errors)</span>
              )}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
              First row: <strong>{preview.valid[0]?.classTitle}</strong> by {preview.valid[0]?.submittedByName}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={!preview?.valid?.length || status.type === "loading" || parseErrors.length > 0}
          style={{
            padding: "10px 20px",
            borderRadius: 8,
            border: "none",
            background: preview?.valid?.length && parseErrors.length === 0 ? "#2c6fad" : "#ccc",
            color: "#fff",
            fontWeight: 600,
            cursor: preview?.valid?.length && parseErrors.length === 0 ? "pointer" : "not-allowed",
            fontSize: 15,
          }}
        >
          {status.type === "loading" ? "Submitting…" : `Submit ${preview?.valid?.length || 0} class${preview?.valid?.length !== 1 ? "es" : ""}`}
        </button>

        {status.type === "error" && (
          <div style={{
            padding: 12,
            borderRadius: 8,
            border: "1px solid #f3c2c2",
            background: "#fff5f5",
          }}>
            {status.message}
          </div>
        )}
      </form>

      {results && (
        <div style={{
          marginTop: 24,
          padding: 16,
          borderRadius: 8,
          border: "1px solid #c2f3d0",
          background: "#f5fff8",
        }}>
          <strong>✅ Submitted successfully!</strong>
          <div style={{ marginTop: 8, fontSize: 13 }}>
            <div>{results.createdCount} class{results.createdCount !== 1 ? "es" : ""} submitted for review.</div>
            <div style={{ marginTop: 4, opacity: 0.7 }}>Batch ID: {results.batchId}</div>
            <div style={{ marginTop: 8 }}>
              Submissions are reviewed before appearing on the site. Please allow up to one week.
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 24, fontSize: 12, opacity: 0.6 }}>
        This page is for authorized partners only. Do not share this URL.
      </div>
    </div>
  );
}
