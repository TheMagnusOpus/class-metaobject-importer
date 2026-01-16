import React, { useEffect, useMemo, useState } from "react";
import { useLoaderData } from "react-router";

export async function loader() {
  return {
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || "",
    apiBaseUrl: process.env.PUBLIC_BASE_URL || "",
  };
}

const TOPIC_OPTIONS = [
  { value: "BEGINNER", label: "Beginner" },
  { value: "TOOLING", label: "Tooling" },
  { value: "CARVING", label: "Carving" },
  { value: "DYEING", label: "Dyeing" },
  { value: "SADDLERY", label: "Saddlery" },
  { value: "WALLETS", label: "Wallets" },
  { value: "BAGS", label: "Bags" },
  { value: "BELTS", label: "Belts" },
  { value: "FIGURE_CARVING", label: "Figure carving" },
  { value: "BUSINESSES", label: "Businesses" },
  { value: "ASSEMBLY", label: "Assembly" },
  { value: "COSTUMING", label: "Costuming" },
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
  const [classTitle, setClassTitle] = useState("");
  const [classUrl, setClassUrl] = useState("");
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("Free");
  const [format, setFormat] = useState("ONLINE");
  const [locationCity, setLocationCity] = useState("Remote");
  const [locationState, setLocationState] = useState("NA");

  // Keep the picker usable, but we will DISPLAY MM-DD-YYYY beneath it
  // datetime-local returns a string like "2026-02-01T18:00"
  const [startDate, setStartDate] = useState("");

  const [topic, setTopic] = useState("BEGINNER");

  const [turnstileToken, setTurnstileToken] = useState("");
  const [status, setStatus] = useState({ type: "idle", message: "" });

  const parsedStartDate = useMemo(() => {
    if (!startDate) return null;
    const d = new Date(startDate);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }, [startDate]);

  const startDateDisplay = useMemo(() => {
    if (!parsedStartDate) return "";
    return formatMMDDYYYY(parsedStartDate);
  }, [parsedStartDate]);

  const canSubmit = useMemo(() => {
    return (
      submittedByName.trim() &&
      submittedByEmail.trim() &&
      classTitle.trim() &&
      cost.trim() &&
      format &&
      locationCity.trim() &&
      locationState.trim() &&
      topic &&
      !!parsedStartDate &&
      turnstileToken
    );
  }, [
    submittedByName,
    submittedByEmail,
    classTitle,
    cost,
    format,
    locationCity,
    locationState,
    topic,
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

      if (!window.turnstile) {
        setTimeout(tryRender, 200);
        return;
      }

      const container = document.getElementById("turnstile-container");
      if (!container) {
        setTimeout(tryRender, 200);
        return;
      }

      if (container.getAttribute("data-rendered") === "true") return;

      window.turnstile.render(container, {
        sitekey: turnstileSiteKey,
        callback: (token) => {
          setTurnstileToken(token || "");
        },
        "expired-callback": () => {
          setTurnstileToken("");
        },
        "error-callback": () => {
          setTurnstileToken("");
        },
      });

      container.setAttribute("data-rendered", "true");
    };

    tryRender();

    return () => {
      cancelled = true;
    };
  }, [turnstileSiteKey]);

  async function onSubmit(e) {
    e.preventDefault();

    if (!turnstileSiteKey) {
      setStatus({
        type: "error",
        message:
          "Turnstile site key is missing. Add TURNSTILE_SITE_KEY to your App Runner environment variables and redeploy.",
      });
      return;
    }

    if (!turnstileToken) {
      setStatus({
        type: "error",
        message:
          "Turnstile token is missing. If you do not see the Turnstile box, something is blocking it from loading.",
      });
      return;
    }

    if (!parsedStartDate) {
      setStatus({
        type: "error",
        message: "Please provide a valid start date.",
      });
      return;
    }

    setStatus({ type: "loading", message: "Submitting…" });

    const payload = {
      submittedByName,
      submittedByEmail,
      classTitle,
      classUrl,
      description,
      cost,
      format,
      locationCity,
      locationState,
      startDate: parsedStartDate.toISOString(),
      topic,

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
    try {
      data = await res.json();
    } catch {
      // ignore
    }

    if (!res.ok) {
      setStatus({
        type: "error",
        message:
          (data && (data.error || data.message)) ||
          `Request failed (${res.status}).`,
      });
      return;
    }

    setStatus({
      type: "success",
      message: "Submitted. Thank you.",
    });

    setClassTitle("");
    setClassUrl("");
    setDescription("");
    setCost("Free");
    setFormat("ONLINE");
    setLocationCity("Remote");
    setLocationState("NA");
    setStartDate("");
    setTopic("BEGINNER");
    setTurnstileToken("");

    try {
      if (window.turnstile) {
        const container = document.getElementById("turnstile-container");
        if (container) {
          container.removeAttribute("data-rendered");
          container.innerHTML = "";
        }
      }
    } catch {
      // ignore
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ marginBottom: 8 }}>Submit a Leathercraft Class</h1>
      <p style={{ marginTop: 0, opacity: 0.8 }}>
        Share an upcoming class with the LearnLeathercraft community.
      </p>

      {!turnstileSiteKey ? (
        <div
          style={{
            border: "1px solid #f3c2c2",
            background: "#fff5f5",
            padding: 12,
            borderRadius: 8,
            marginTop: 16,
            marginBottom: 16,
          }}
        >
          <strong>Turnstile is not configured.</strong>
          <div style={{ marginTop: 6 }}>
            Add <code>TURNSTILE_SITE_KEY</code> to App Runner environment variables
            and redeploy. The page cannot submit without it.
          </div>
        </div>
      ) : null}

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <label>Name</label>
          <input value={submittedByName} onChange={(e) => setSubmittedByName(e.target.value)} />
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label>Email</label>
          <input value={submittedByEmail} onChange={(e) => setSubmittedByEmail(e.target.value)} />
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label>Class title</label>
          <input value={classTitle} onChange={(e) => setClassTitle(e.target.value)} />
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label>Class URL (optional)</label>
          <input value={classUrl} onChange={(e) => setClassUrl(e.target.value)} />
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label>Description (optional)</label>
          <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label>Cost</label>
          <input value={cost} onChange={(e) => setCost(e.target.value)} />
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label>Format</label>
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="ONLINE">Online</option>
            <option value="IN_PERSON">In person</option>
            <option value="HYBRID">Hybrid</option>
          </select>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label>Location city</label>
          <input value={locationCity} onChange={(e) => setLocationCity(e.target.value)} />
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label>Location state</label>
          <input value={locationState} onChange={(e) => setLocationState(e.target.value)} />
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label>Start date</label>
          <input
            type="datetime-local"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <small style={{ opacity: 0.7 }}>
            Display format: {startDateDisplay ? startDateDisplay : "MM-DD-YYYY"}
          </small>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label>Topic</label>
          <select value={topic} onChange={(e) => setTopic(e.target.value)}>
            {TOPIC_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <small style={{ opacity: 0.7 }}>
            Available topics: {TOPIC_OPTIONS.map((t) => t.label).join(", ")}
          </small>
        </div>

        <div style={{ marginTop: 8 }}>
          <div id="turnstile-container" />
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
            {turnstileToken ? "Turnstile verified." : "Complete the Turnstile check above."}
          </div>
        </div>

        <button
          type="submit"
          disabled={!canSubmit || status.type === "loading"}
          style={{
            marginTop: 8,
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #ccc",
            cursor: canSubmit ? "pointer" : "not-allowed",
          }}
        >
          {status.type === "loading" ? "Submitting…" : "Submit class"}
        </button>

        {status.type !== "idle" ? (
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              border:
                status.type === "error"
                  ? "1px solid #f3c2c2"
                  : "1px solid #c2f3d0",
              background:
                status.type === "error" ? "#fff5f5" : "#f5fff8",
            }}
          >
            {status.message}
          </div>
        ) : null}
      </form>

      <div style={{ marginTop: 18, fontSize: 13, opacity: 0.85 }}>
        Note: Submissions are reviewed to prevent spam and duplicates. Please allow one week for classes to be reviewed before appearing on the website. If you have any issues submitting this form, such as receiving a "Missing Turnstile token" error, please reach out through the contact page on LearnLeathercraft.com
      </div>
    </div>
  );
}
