import { vitePlugin as remix } from "@remix-run/dev";
import { installGlobals } from "@remix-run/node";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

installGlobals({ nativeFetch: true });

// Related: https://github.com/remix-run/remix/issues/2835#issuecomment-1144102176
// Replace the HOST env var with SHOPIFY_APP_URL so that it doesn't break the remix server. The CLI will eventually
// stop passing in HOST, so we can remove this workaround after the next major release.
if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

// const host = new URL(process.env.SHOPIFY_APP_URL || "http://localhost")
//   .hostname; // Keep this if you need it for `allowedHosts` but don't use it for `hmr.host`

let hmrConfig;

// Always bind HMR to localhost when running locally
// Use a fixed port for HMR or default to 8002 if FRONTEND_PORT isn't set
hmrConfig = {
  protocol: "ws",
  host: "localhost", // <-- Change this to always be localhost

  port: parseInt(process.env.FRONTEND_PORT) || 8002, // Re-using 8002 as a fallback or take from FRONTEND_PORT
  clientPort: parseInt(process.env.FRONTEND_PORT) || 8002, // Match clientPort to server port
};


export default defineConfig({
  server: {
    // Keep allowedHosts if you need it, it's about what hosts can access, not what the server binds to
    // allowedHosts: ["localhost", new URL(process.env.SHOPIFY_APP_URL || "http://localhost").hostname],
    allowedHosts: [
      'localhost', // Always good to include
      'shopifyapp.shop', // The host that is being blocked
    'app.shopifyapp.shop',
    '.mukeshyadav.com',
    new URL(process.env.SHOPIFY_APP_URL || "http://localhost").hostname,
      // Add any other hosts that might access your dev server, e.g., your ngrok URL
    ], // Ensure localhost is always allowed
    cors: {
      preflightContinue: true,
    },
    port: Number(process.env.PORT || 3000), // Main app port controlled by process.env.PORT
    hmr: hmrConfig, // Apply the modified HMR config
    fs: {
      // See https://vitejs.dev/config/server-options.html#server-fs-allow for more information
      allow: ["app", "node_modules"],
    },
  },
  plugins: [
    remix({
      ignoredRouteFiles: ["**/.*"],
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
        v3_lazyRouteDiscovery: true,
        v3_singleFetch: false,
        v3_routeConfig: true,
      },
    }),
    tsconfigPaths(),
  ],
  build: {
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    include: ["@shopify/app-bridge-react", "@shopify/polaris"],
  },
});

// // new one
// import { vitePlugin as remix } from "@remix-run/dev";
// import { installGlobals } from "@remix-run/node";
// import { defineConfig } from "vite";
// import tsconfigPaths from "vite-tsconfig-paths";

// installGlobals({ nativeFetch: true });

// // Related: https://github.com/remix-run/remix/issues/2835#issuecomment-1144102176
// // Replace the HOST env var with SHOPIFY_APP_URL so that it doesn't break the remix server. The CLI will eventually
// // stop passing in HOST, so we can remove this workaround after the next major release.
// if (
//   process.env.HOST &&
//   (!process.env.SHOPIFY_APP_URL ||
//     process.env.SHOPIFY_APP_URL === process.env.HOST)
// ) {
//   process.env.SHOPIFY_APP_URL = process.env.HOST;
//   delete process.env.HOST;
// }

// // const host = new URL(process.env.SHOPIFY_APP_URL || "http://localhost")
// //   .hostname; // Keep this if you need it for `allowedHosts` but don't use it for `hmr.host`

// let hmrConfig;

// // Always bind HMR to localhost when running locally
// // Use a fixed port for HMR or default to 8002 if FRONTEND_PORT isn't set
// hmrConfig = {
//   protocol: "ws",
//   host: "localhost", // <-- Change this to always be localhost
//   port: parseInt(process.env.FRONTEND_PORT) || 8002, // Re-using 8002 as a fallback or take from FRONTEND_PORT
//   clientPort: parseInt(process.env.FRONTEND_PORT) || 8002, // Match clientPort to server port
// };


// export default defineConfig({
//   server: {
//     // Keep allowedHosts if you need it, it's about what hosts can access, not what the server binds to
//     allowedHosts: [
//       "localhost",
//       "shopifyapp.shop", // <--- ADD THIS LINE
//       new URL(process.env.SHOPIFY_APP_URL || "http://localhost").hostname,
//     ], // Ensure localhost is always allowed
//     cors: {
//       preflightContinue: true,
//     },
//     port: Number(process.env.PORT || 3000), // Main app port controlled by process.env.PORT
//     hmr: hmrConfig, // Apply the modified HMR config
//     fs: {
//       // See https://vitejs.dev/config/server-options.html#server-fs-allow for more information
//       allow: ["app", "node_modules"],
//     },
//   },
//   plugins: [
//     remix({
//       ignoredRouteFiles: ["**/.*"],
//       future: {
//         v3_fetcherPersist: true,
//         v3_relativeSplatPath: true,
//         v3_throwAbortReason: true,
//         v3_lazyRouteDiscovery: true,
//         v3_singleFetch: false,
//         v3_routeConfig: true,
//       },
//     }),
//     tsconfigPaths(),
//   ],
//   build: {
//     assetsInlineLimit: 0,
//   },
//   optimizeDeps: {
//     include: ["@shopify/app-bridge-react", "@shopify/polaris"],
//   },
// });
