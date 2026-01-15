import { Outlet, useLoaderData, useRouteError, useLocation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();
  const location = useLocation();

  // Preserve embedded context params (shop + host)
  const search = location.search || "";

  const withSearch = (path) => `${path}${search}`;

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href={withSearch("/app")}>Home</s-link>

        <s-link href={withSearch("/app/import-classes")}>Import classes</s-link>
        <s-link href={withSearch("/app/review-classes")}>Review submissions</s-link>

        <s-link href={withSearch("/app/additional")}>Additional page</s-link>
      </s-app-nav>

      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
