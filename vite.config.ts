import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouterGenerator } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

// Resolve the vinxi/http + node:async_hooks stubs relative to THIS repo instead
// of a hardcoded absolute path. The previous alias pointed at
// /home/agent-lead/repos/... which no longer exists after the environment
// rebuild, so builds failed with ENOENT on every clone. Relative resolution
// works for any checkout location.
const VINXI_STUB = fileURLToPath(new URL("./src/lib/vinxi-stub.ts", import.meta.url));
export default defineConfig({
  server: {
    port: 3000,
    host: true,
    allowedHosts: true,
  },
  build: {
    minify: "esbuild",
    target: "esnext",
    reportCompressedSize: false,
    rollupOptions: {
      external: ['@libsql/client', 'drizzle-orm/libsql'],
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/react-router') || id.includes('node_modules/@tanstack/react-router') || id.includes('node_modules/@tanstack/history') || id.includes('node_modules/@tanstack/store')) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/jspdf') || id.includes('node_modules/html2canvas')) {
            return 'vendor-pdf';
          }
          if (id.includes('node_modules/purify') || id.includes('node_modules/dompurify')) return 'vendor-purify';
        },
      },
    },
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "vinxi/http": VINXI_STUB,
      "node:async_hooks": VINXI_STUB,
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
