import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";
import { registerCarrierService } from "../utlis/registerCarrierService"; // adjust path

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  // const callbackUrl = process.env.SHOPIFY_APP_URL + "/api/rates";
  const callbackUrl = "https://shopifyapp.shop/api/rates";

  // ⚙️ Register carrier service on app load

  // const callbackUrl = new URL("/api/rates", request.url).origin + "/api/rates";
  await registerCarrierService(admin, callbackUrl);

  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">
          Home
        </Link>
        <Link to="/app/fedex">FEDEX</Link>
        <Link to="/app/tnt">TNT</Link>
        <Link to="/app/containers">Isothermal Container</Link>
{/*
        <Link to="/app/brt">BRT data</Link>

        <Link to="/app/couriers">Couriers</Link>
        <Link to="/app/dryice">Dry Ice</Link>
        <Link to="/app/dryice">Quick calculator</Link> */}
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
