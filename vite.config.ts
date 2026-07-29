import tailwindcss from "@tailwindcss/vite";
import { tanstackRouterGenerator } from "@tanstack/router-plugin/vite";
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
      "vinxi/http": "/home/team/shared/site/src/lib/vinxi-stub.ts",
      "node:async_hooks": "/home/team/shared/site/src/lib/vinxi-stub.ts",
    },
  },
  build: {
    rollupOptions: {
      // Externalize server-only deps to prevent them from being
      // bundled into the client JS. The client never actually
      // calls these (createServerFn is polyfilled to a no-op).
      external: [
        "@libsql/client",
        "drizzle-orm/libsql",
      ],
    },
  },
  plugins: [
    tailwindcss(),
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tanstackRouterGenerator(),
    viteReact(),
  ],
});
