import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  server: {
    port: 3000,
    host: true,
    allowedHosts: true,
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      // Fix bare "react/jsx-runtime" imports in dynamically-loaded chunks
      // by resolving to the actual CJS file that Vite can pre-bundle
      "react/jsx-runtime": "react/jsx-runtime",
      "react/jsx-dev-runtime": "react/jsx-dev-runtime",
    },
  },
  ssr: {
    // Force these packages to be bundled in client builds instead of
    // being externalized. When externalized, chunks import from "react"
    // and "react/jsx-runtime" as bare specifiers, which the importmap
    // resolves to our /react.js shim. The shim has a SEPARATE copy of
    // ReactSharedInternals from the bundled ReactDOM — H stays null
    // and hooks crash with "Cannot read properties of null (reading 'useState')".
    noExternal: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "@tanstack/react-router",
      "@tanstack/history",
      "@tanstack/router-core",
      "@tanstack/react-router/ssr/server",
      "@tanstack/router-core/ssr/client",
      "@tanstack/router-core/ssr/server",
    ],
  },
  plugins: [
    tailwindcss(),
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tanstackStart(),
    viteReact(),
  ],
});
