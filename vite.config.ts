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
    // Force @tanstack/* packages to be bundled in both client and SSR builds
    // instead of being externalized. TanStack Start externalizes them by default,
    // but client bundles can't resolve bare specifier imports.
    noExternal: [/@tanstack/],
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
