import { useState } from "react-router";

export default function PublicClassSubmit() {
  const [singleResult, setSingleResult] = useState(null);
  const [bulkResult, setBulkResult] = useState(null);

  async function submitSingle(e) {
    e.preventDefault();
    setSingleResult(null);

    const fd = new FormData(e.currentTarget);

    const resp = await fetch("/api/class-submissions/single", { method: "POST", body: fd });
    const data = await resp.json().catch(() => ({}));
    setSingleResult(data);
  }

  async function submitBulk(e) {
    e.preventDefault();
    setBulkResult(null);

    const fd = new FormData(e.currentTarget);

    const resp = await fetch("/api/class-submissions/bulk", { method: "POST", body: fd });
    const data = await resp.json().catch(() => ({}));
    setBulkResult(data);
  }

  return (
    <s-page heading="Submit a leathercraft class">
      <s-section heading="Before you submit">
        <s-paragraph>
          This is a community resource. Submissions are reviewed before they appear publicly.
          Please include your name and email so we can follow up if something needs clarification.
        </s-paragraph>
      </s-section>

      <s-section heading="Submit one class">
        <form onSubmit={submitSingle}>
          <s-stack direction="block" gap="base">
            {/* Honeypot */}
            <input type="text" name="website" tabIndex="-1" autoComplete="off" style={{ display: "none" }} />

            <s-text-field label="Your name" name="submitted_by_name" required />
            <s-text-field label="Your email" name="submitted_by_email" type="email" required />

            <s-text-field label="Class title" name="class_title" required />
            <s-text-field label="Instructor name" name="instructor_name" />

            <s-text-field label="Date (YYYY-MM-DD or MM/DD/YYYY)" name="start_date" required />

            <s-text-field label="Format (In-Person, Online, Hybrid)" name="format" />
            <s-text-field label="City" name="location_city" />
            <s-text-field label="State / Region" name="location_state" />

            <s-text-field label="Cost" name="cost" />
            <s-text-field label="Registration URL" name="registration_url" />
            <s-text-field label="Topics (comma separated)" name="topics" />

            <s-textarea label="Description" name="class_description" />

            {/* Turnstile
               You must include the Turnstile widget on the page and ensure it posts
               cf-turnstile-response. How you embed depends on where this route is rendered.
               If this is rendered inside your Shopify app runtime, add the script tag in your theme
               or your app host page.
            */}
            <div>
              <div className="cf-turnstile" data-sitekey="YOUR_TURNSTILE_SITE_KEY"></div>
            </div>

            <s-button type="submit" variant="primary">Submit</s-button>

            {singleResult?.ok ? (
              <s-paragraph>
                Submitted. Thanks. Your submission is pending review.
              </s-paragraph>
            ) : null}

            {singleResult?.error ? (
              <s-paragraph>
                Submission failed: <s-text emphasis="bold">{singleResult.error}</s-text>
              </s-paragraph>
            ) : null}
          </s-stack>
        </form>
      </s-section>

      <s-section heading="Bulk upload (CSV)">
        <s-paragraph>
          Upload a CSV to submit multiple classes at once. These will be marked Pending until approved.
        </s-paragraph>

        <form onSubmit={submitBulk} encType="multipart/form-data">
          <s-stack direction="block" gap="base">
            {/* Honeypot */}
            <input type="text" name="website" tabIndex="-1" autoComplete="off" style={{ display: "none" }} />

            <s-text-field label="Your name" name="submitted_by_name" required />
            <s-text-field label="Your email" name="submitted_by_email" type="email" required />

            <input type="file" name="csv_file" accept=".csv,text/csv" required />

            <div>
              <div className="cf-turnstile" data-sitekey="0x4AAAAAACMYdI9hEcJm1J4w"></div>
            </div>

            <s-button type="submit" variant="primary">Upload CSV</s-button>

            {bulkResult?.ok ? (
              <s-paragraph>
                Uploaded. Imported: <s-text emphasis="bold">{bulkResult.imported}</s-text>
              </s-paragraph>
            ) : null}

            {bulkResult?.errors?.length ? (
              <s-section heading="Upload issues">
                <s-unordered-list>
                  {bulkResult.errors.slice(0, 20).map((err, idx) => (
                    <s-list-item key={idx}>{err}</s-list-item>
                  ))}
                </s-unordered-list>
              </s-section>
            ) : null}

            {bulkResult?.error ? (
              <s-paragraph>
                Upload failed: <s-text emphasis="bold">{bulkResult.error}</s-text>
              </s-paragraph>
            ) : null}
          </s-stack>
        </form>

        <s-section slot="aside" heading="CSV headers">
          <s-paragraph>
            external_id, class_title, class_description, instructor_name, format, location_city,
            location_state, start_date, cost, registration_url, topics
          </s-paragraph>
        </s-section>
      </s-section>
    </s-page>
  );
}
