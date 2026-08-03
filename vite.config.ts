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
  build: {
    minify: false,
    target: "esnext",
    reportCompressedSize: false,
    rollupOptions: {
      external: ['@libsql/client', 'drizzle-orm/libsql'],
    },
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "vinxi/http": "/home/team/shared/site/src/lib/vinxi-stub.ts",
      "node:async_hooks": "/home/team/shared/site/src/lib/vinxi-stub.ts",
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
