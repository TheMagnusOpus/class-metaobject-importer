// app/routes/pages.leathercraft-classes.submit.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLoaderData } from "react-router";

export async function loader() {
  return {
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || "",
    apiBaseUrl: process.env.PUBLIC_BASE_URL || "",
  };
}

const TOPIC_OPTIONS = [
  { value: "TOOLING", label: "Tooling" },
  { value: "DYEING_AND_FINISHING", label: "Dyeing and finishing" },
  { value: "ASSEMBLY", label: "Assembly" },
  { value: "SADDLERY", label: "Saddlery" },
  { value: "BAGS_AND_ACCESSORIES", label: "Bags & Accessories" },
  { value: "SMALL_GOODS", label: "Small goods" },
  { value: "BUSINESS_CLASS", label: "Business class" },
];

const SKILL_LEVEL_OPTIONS = [
  { value: "BEGINNER", label: "Beginner" },
  { value: "INTERMEDIATE", label: "Intermediate" },
  { value: "ADVANCED", label: "Advanced" },
  { value: "ALL_SKILL_LEVELS", label: "All skill levels" },
];

function formatMMDDYYYY(dateObj) {
  if (!dateObj || Number.isNaN(dateObj.getTime())) return "";
  const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
  const dd = String(dateObj.getDate()).padStart(2, "0");
  const yyyy = String(dateObj.getFullYear());
  return `${mm}-${dd}-${yyyy}`;
}

export default function PublicClassSubmit() {
  const { turnstileSiteKey } = useLoaderData();

  const [submittedByName, setSubmittedByName] = useState("");
  const [submittedByEmail, setSubmittedByEmail] = useState("");
  const [instructorName, setInstructorName] = useState("");
  const [instructorEmail, setInstructorEmail] = useState("");
  const [classTitle, setClassTitle] = useState("");
  const [classUrl, setClassUrl] = useState("");
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("Free");
  const [format, setFormat] = useState("ONLINE");
  const [locationCity, setLocationCity] = useState("");
  const [locationState, setLocationState] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [topic, setTopic] = useState("TOOLING");
  const [skillLevel, setSkillLevel] = useState("ALL_SKILL_LEVELS");

  const [turnstileToken, setTurnstileToken] = useState("");
  const [status, setStatus] = useState({ type: "idle", message: "" });

  const parsedStartDate = useMemo(() => {
    if (!startDate) return null;
    const d = new Date(startDate);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [startDate]);

  const parsedEndDate = useMemo(() => {
    if (!endDate) return null;
    const d = new Date(endDate);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [endDate]);

  const startDateDisplay = useMemo(() => formatMMDDYYYY(parsedStartDate), [parsedStartDate]);
  const endDateDisplay = useMemo(() => formatMMDDYYYY(parsedEndDate), [parsedEndDate]);

  const canSubmit = useMemo(() => {
    return (
      submittedByName.trim() &&
      submittedByEmail.trim() &&
      instructorName.trim() &&
      classTitle.trim() &&
      cost.trim() &&
      format &&
      locationCity.trim() &&
      locationState.trim() &&
      topic &&
      skillLevel &&
      !!parsedStartDate &&
      turnstileToken
    );
  }, [
    submittedByName,
    submittedByEmail,
    instructorName,
    classTitle,
    cost,
    format,
    locationCity,
    locationState,
    topic,
    skillLevel,
    parsedStartDate,
    turnstileToken,
  ]);

  useEffect(() => {
    if (!turnstileSiteKey) return;

    const existing = document.querySelector('script[data-turnstile="true"]');
    if (!existing) {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.defer = true;
      s.setAttribute("data-turnstile", "true");
      document.head.appendChild(s);
    }

    let cancelled = false;

    const tryRender = () => {
      if (cancelled) return;
      if (!window.turnstile) { setTimeout(tryRender, 200); return; }
      const container = document.getElementById("turnstile-container");
      if (!container) { setTimeout(tryRender, 200); return; }
      if (container.getAttribute("data-rendered") === "true") return;

      window.turnstile.render(container, {
        sitekey: turnstileSiteKey,
        callback: (token) => setTurnstileToken(token || ""),
        "expired-callback": () => setTurnstileToken(""),
        "error-callback": () => setTurnstileToken(""),
      });

      container.setAttribute("data-rendered", "true");
    };

    tryRender();
    return () => { cancelled = true; };
  }, [turnstileSiteKey]);

  async function onSubmit(e) {
    e.preventDefault();

    if (!turnstileSiteKey) {
      setStatus({ type: "error", message: "Turnstile site key is missing. Add TURNSTILE_SITE_KEY to your DigitalOcean environment variables and redeploy." });
      return;
    }

    if (!turnstileToken) {
      setStatus({ type: "error", message: "Turnstile token is missing. If you do not see the Turnstile box, something is blocking it from loading." });
      return;
    }

    if (!parsedStartDate) {
      setStatus({ type: "error", message: "Please provide a valid start date." });
      return;
    }

    setStatus({ type: "loading", message: "Submitting…" });

    const payload = {
      submittedByName,
      submittedByEmail,
      instructorName,
      instructorEmail,
      classTitle,
      classUrl,
      description,
      cost,
      format,
      locationCity,
      locationState,
      startDate: parsedStartDate.toISOString(),
      endDate: parsedEndDate ? parsedEndDate.toISOString() : null,
      topic,
      skillLevel,
      turnstileToken,
      cfTurnstileResponse: turnstileToken,
      "cf-turnstile-response": turnstileToken,
    };

    const res = await fetch("/api/class-submissions/single", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    let data = null;
    try { data = await res.json(); } catch { /* ignore */ }

    if (!res.ok) {
      setStatus({ type: "error", message: (data && (data.error || data.message)) || `Request failed (${res.status}).` });
      return;
    }

    setStatus({ type: "success", message: "Submitted. Thank you! Submissions are reviewed before appearing on the site. Please allow up to one week." });

    // Reset form
    setSubmittedByName("");
    setSubmittedByEmail("");
    setInstructorName("");
    setInstructorEmail("");
    setClassTitle("");
    setClassUrl("");
    setDescription("");
    setCost("Free");
    setFormat("ONLINE");
    setLocationCity("");
    setLocationState("");
    setStartDate("");
    setEndDate("");
    setTopic("TOOLING");
    setSkillLevel("ALL_SKILL_LEVELS");
    setTurnstileToken("");

    try {
      if (window.turnstile) {
        const container = document.getElementById("turnstile-container");
        if (container) {
          container.removeAttribute("data-rendered");
          container.innerHTML = "";
        }
      }
    } catch { /* ignore */ }
  }

  const inputStyle = {
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid #ccc",
    fontSize: 15,
    width: "100%",
    boxSizing: "border-box",
  };

  const labelStyle = {
    fontWeight: 600,
    fontSize: 14,
  };

  const fieldStyle = {
    display: "grid",
    gap: 4,
  };

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "32px 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ marginBottom: 4 }}>Submit a Leathercraft Class</h1>
      <p style={{ marginTop: 0, opacity: 0.75, marginBottom: 24 }}>
        Share an upcoming class with the LearnLeathercraft community. All submissions are reviewed before appearing on the site.
      </p>

      {!turnstileSiteKey && (
        <div style={{ border: "1px solid #f3c2c2", background: "#fff5f5", padding: 12, borderRadius: 8, marginBottom: 16 }}>
          <strong>Turnstile is not configured.</strong>
          <div style={{ marginTop: 6 }}>Add <code>TURNSTILE_SITE_KEY</code> to your DigitalOcean environment variables and redeploy.</div>
        </div>
      )}

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 16 }}>

        <h3 style={{ margin: "4px 0 0", borderBottom: "1px solid #eee", paddingBottom: 6 }}>Your information</h3>

        <div style={fieldStyle}>
          <label style={labelStyle}>Your name <span style={{ color: "#c0392b" }}>*</span></label>
          <input style={inputStyle} value={submittedByName} onChange={(e) => setSubmittedByName(e.target.value)} placeholder="Your full name" />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Your email <span style={{ color: "#c0392b" }}>*</span></label>
          <input style={inputStyle} type="email" value={submittedByEmail} onChange={(e) => setSubmittedByEmail(e.target.value)} placeholder="your@email.com" />
        </div>

        <h3 style={{ margin: "4px 0 0", borderBottom: "1px solid #eee", paddingBottom: 6 }}>Instructor information</h3>

        <div style={fieldStyle}>
          <label style={labelStyle}>Instructor name <span style={{ color: "#c0392b" }}>*</span></label>
          <input style={inputStyle} value={instructorName} onChange={(e) => setInstructorName(e.target.value)} placeholder="Who is teaching the class?" />
          <small style={{ opacity: 0.6 }}>If you are the instructor, enter your own name again.</small>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Instructor email <span style={{ opacity: 0.6, fontWeight: 400 }}>(optional)</span></label>
          <input style={inputStyle} type="email" value={instructorEmail} onChange={(e) => setInstructorEmail(e.target.value)} placeholder="instructor@email.com" />
        </div>

        <h3 style={{ margin: "4px 0 0", borderBottom: "1px solid #eee", paddingBottom: 6 }}>Class details</h3>

        <div style={fieldStyle}>
          <label style={labelStyle}>Class title <span style={{ color: "#c0392b" }}>*</span></label>
          <input style={inputStyle} value={classTitle} onChange={(e) => setClassTitle(e.target.value)} placeholder="Name of the class" />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Class URL <span style={{ opacity: 0.6, fontWeight: 400 }}>(optional)</span></label>
          <input style={inputStyle} value={classUrl} onChange={(e) => setClassUrl(e.target.value)} placeholder="https://..." />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Description <span style={{ opacity: 0.6, fontWeight: 400 }}>(optional)</span></label>
          <textarea style={{ ...inputStyle, resize: "vertical" }} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Tell us about the class…" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Topic <span style={{ color: "#c0392b" }}>*</span></label>
            <select style={inputStyle} value={topic} onChange={(e) => setTopic(e.target.value)}>
              {TOPIC_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Skill level <span style={{ color: "#c0392b" }}>*</span></label>
            <select style={inputStyle} value={skillLevel} onChange={(e) => setSkillLevel(e.target.value)}>
              {SKILL_LEVEL_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Format <span style={{ color: "#c0392b" }}>*</span></label>
            <select style={inputStyle} value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="ONLINE">Online</option>
              <option value="IN_PERSON">In person</option>
              <option value="HYBRID">Hybrid</option>
            </select>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Cost <span style={{ color: "#c0392b" }}>*</span></label>
            <input style={inputStyle} value={cost} onChange={(e) => setCost(e.target.value)} placeholder="e.g. $150 or Free" />
          </div>
        </div>

        <h3 style={{ margin: "4px 0 0", borderBottom: "1px solid #eee", paddingBottom: 6 }}>Location & dates</h3>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>City <span style={{ color: "#c0392b" }}>*</span></label>
            <input style={inputStyle} value={locationCity} onChange={(e) => setLocationCity(e.target.value)} placeholder="City (or Remote)" />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>State <span style={{ color: "#c0392b" }}>*</span></label>
            <input style={inputStyle} value={locationState} onChange={(e) => setLocationState(e.target.value)} placeholder="State (or NA)" />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Start date <span style={{ color: "#c0392b" }}>*</span></label>
            <input style={inputStyle} type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            {startDateDisplay && <small style={{ opacity: 0.6 }}>{startDateDisplay}</small>}
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>End date <span style={{ opacity: 0.6, fontWeight: 400 }}>(optional)</span></label>
            <input style={inputStyle} type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            {endDateDisplay && <small style={{ opacity: 0.6 }}>{endDateDisplay}</small>}
          </div>
        </div>

        <div style={{ marginTop: 8 }}>
          <div id="turnstile-container" />
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
            {turnstileToken ? "✓ Verified" : "Complete the security check above to enable submission."}
          </div>
        </div>

        <button
          type="submit"
          disabled={!canSubmit || status.type === "loading"}
          style={{
            marginTop: 4,
            padding: "12px 16px",
            borderRadius: 8,
            border: "none",
            background: canSubmit ? "#2c6fad" : "#ccc",
            color: "#fff",
            fontWeight: 600,
            fontSize: 16,
            cursor: canSubmit ? "pointer" : "not-allowed",
          }}
        >
          {status.type === "loading" ? "Submitting…" : "Submit class"}
        </button>

        {status.type !== "idle" && (
          <div style={{
            padding: 12,
            borderRadius: 8,
            border: status.type === "error" ? "1px solid #f3c2c2" : "1px solid #c2f3d0",
            background: status.type === "error" ? "#fff5f5" : "#f5fff8",
          }}>
            {status.message}
          </div>
        )}
      </form>

      <div style={{ marginTop: 20, fontSize: 13, opacity: 0.7, borderTop: "1px solid #eee", paddingTop: 16 }}>
        Submissions are reviewed to prevent spam and duplicates. Please allow one week for classes to be reviewed before appearing on the website. If you have any issues, please reach out through the contact page on LearnLeathercraft.com.
      </div>
    </div>
  );
}
