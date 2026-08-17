import { useRef, useState } from "react";
import { useRouteError, redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

function getContextFromUrlOrReferer(request) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "";
  const host = url.searchParams.get("host") || "";

  if (shop && host) return { shop, host };

  const ref = request.headers.get("referer");
  if (ref) {
    try {
      const r = new URL(ref);
      return {
        shop: shop || r.searchParams.get("shop") || "",
        host: host || r.searchParams.get("host") || "",
      };
    } catch {
      // ignore
    }
  }

  return { shop, host };
}

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const ctx = getContextFromUrlOrReferer(request);

  if (
    (!url.searchParams.get("shop") || !url.searchParams.get("host")) &&
    ctx.shop &&
    ctx.host
  ) {
    url.searchParams.set("shop", ctx.shop);
    url.searchParams.set("host", ctx.host);
    throw redirect(url.toString());
  }

  await authenticate.admin(request);
  return { shop: ctx.shop, host: ctx.host };
};

export default function ImportClasses() {
  const shopify = useAppBridge();
  const fileInputRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    setSubmitting(true);
    setResult(null);

    try {
      const token = await shopify.idToken();

      const formData = new FormData();
      formData.append("csv_file", file);

      // Uploads go to a dedicated resource route (no UI component), so the
      // response is always plain, clean JSON — never turbo-stream, never a
      // rendered page.
      const uploadUrl =
        window.location.pathname.replace(/\/import-classes\/?$/, "/import-classes/upload") +
        window.location.search;

      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const text = await res.text();
        setResult({
          ok: false,
          imported: 0,
          errors: [
            `HTTP ${res.status} ${res.statusText} — server returned ${contentType || "unknown content type"} instead of JSON.`,
            `First 300 chars of response: ${text.slice(0, 300)}`,
          ],
        });
        return;
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({ ok: false, imported: 0, errors: [String(err?.message || err)] });
    } finally {
      setSubmitting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <s-page heading="Import classes (CSV)">
      <s-section heading="Upload CSV">
        <s-paragraph>
          Upload a CSV to create or update class submissions. New imports should
          be Pending until approved.
        </s-paragraph>

        <s-paragraph>
          For community submissions, these fields are required:
          <br />
          <s-text emphasis="bold">submitted_by_name</s-text> and{" "}
          <s-text emphasis="bold">submitted_by_email</s-text>
        </s-paragraph>

        <form onSubmit={handleSubmit}>
          <s-stack direction="block" gap="base">
            <input
              type="file"
              name="csv_file"
              accept=".csv,text/csv"
              required
              ref={fileInputRef}
            />
            <s-button
              type="submit"
              variant="primary"
              {...(submitting ? { loading: true } : {})}
            >
              Import CSV
            </s-button>
          </s-stack>
        </form>

        {typeof result?.imported === "number" ? (
          <s-paragraph>
            Imported or updated:{" "}
            <s-text emphasis="bold">{result.imported}</s-text>
          </s-paragraph>
        ) : null}

        {result?.errors?.length ? (
          <s-section heading="Errors">
            <s-unordered-list>
              {result.errors.slice(0, 20).map((e, idx) => (
                <s-list-item key={idx}>{e}</s-list-item>
              ))}
            </s-unordered-list>
            {result.errors.length > 20 ? (
              <s-paragraph>Showing first 20 errors.</s-paragraph>
            ) : null}
          </s-section>
        ) : null}
      </s-section>

      <s-section slot="aside" heading="CSV headers">
        <s-paragraph>
          external_id, class_title, class_description, instructor_name, format,
          location_city, location_state, start_date, cost, registration_url,
          topics, status, submitted_by_name, submitted_by_email
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
