import { Outlet, useLoaderData, useRouteError, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();
  const navigate = useNavigate();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-nav-item
          label="Home"
          onClick={() => navigate("/app")}
        />
        <s-nav-item
          label="Import classes"
          onClick={() => navigate("/app/import-classes")}
        />
        <s-nav-item
          label="Review submissions"
          onClick={() => navigate("/app/review-classes")}
        />
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
