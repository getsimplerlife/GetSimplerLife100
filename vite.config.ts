import { spawn } from "node:child_process";
import { mkdirSync, openSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouterGenerator } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { devRateLimitPlugin } from "./src/lib/rate-limit-dev";
import tsConfigPaths from "vite-tsconfig-paths";

// Resolve the vinxi/http + node:async_hooks stubs relative to THIS repo instead
// of a hardcoded absolute path. The previous alias pointed at
// /home/agent-lead/repos/... which no longer exists after the environment
// rebuild, so builds failed with ENOENT on every clone. Relative resolution
// works for any checkout location.
const VINXI_STUB = fileURLToPath(new URL("./src/lib/vinxi-stub.ts", import.meta.url));

/**
 * SLICE 149 — make sure the hourly backup loop is running whenever this box is
 * serving.
 *
 * Why here: the only listener on the machine that holds DATA_DIR is `vite dev`,
 * started by the platform's supervisor, and the in-process scheduler only ever
 * ran inside `prod-server.ts`. Nothing ticked, so the "hourly" claim was false
 * (measured 2026-10-31: the newest off-box object was ~7 hours old).
 *
 * What this does: on dev-server start it calls `scripts/ensure-backup-daemon.mjs`,
 * which starts the loop DETACHED (own session, stdio to `.run/backup-daemon.log`)
 * only if no loop is already supervising the archive root. The loop is therefore
 * a sibling of this process, not a child: stopping or restarting the web server
 * does not stop it, which is exactly what the slice has to prove. A box restart
 * re-runs this hook and the loop comes back with no human involved.
 *
 * Deliberately fire-and-forget and wrapped: a backup supervisor must never be
 * able to break the dev server. Skipped under test, and under
 * BACKUP_DAEMON_DISABLE=1.
 */
function backupDaemonSupervisor() {
  return {
    name: "backup-daemon-supervisor",
    apply: "serve" as const,
    configureServer() {
      if (process.env.VITEST || process.env.BACKUP_DAEMON_DISABLE === "1") return;
      try {
        const root = fileURLToPath(new URL(".", import.meta.url));
        const child = spawn("/bin/bash", ["-lc", `exec bun ${JSON.stringify(`${root}scripts/ensure-backup-daemon.mjs`)}`], {
          cwd: root,
          detached: true,
          stdio: "ignore",
        });
        child.on("error", () => {});
        child.unref();
      } catch {
        /* never break the server over this */
      }
    },
  };
}
/**
 * SLICE 150b — run the DATA_DIR boot half whenever this box starts serving.
 *
 * `scripts/ensure-data-dir.mjs` (resolve -> migrate the pre-relocation store ->
 * seed missing shape files) was written in slice 150 for exactly this runtime,
 * because `vite dev` never boots `prod-server.ts`, and then had no caller — so
 * the one machine that serves the working site still ran neither the migration
 * nor the seed. This hooks it to dev-server start, the same way the backup
 * supervisor is hooked: detached, output to `.run/data-dir.log`, fire-and-forget,
 * and never able to break the server. Skipped under test and under
 * DATA_DIR_ENSURE_DISABLE=1.
 */
function dataDirBootHook() {
  return {
    name: "data-dir-boot",
    apply: "serve" as const,
    configureServer() {
      if (process.env.VITEST || process.env.DATA_DIR_ENSURE_DISABLE === "1") return;
      try {
        const root = fileURLToPath(new URL(".", import.meta.url));
        mkdirSync(join(root, ".run"), { recursive: true });
        const log = openSync(join(root, ".run", "data-dir.log"), "a");
        const child = spawn("/bin/bash", ["-lc", `exec bun ${JSON.stringify(`${root}scripts/ensure-data-dir.mjs`)}`], {
          cwd: root,
          detached: true,
          stdio: ["ignore", log, log],
        });
        child.on("error", () => {});
        child.unref();
      } catch {
        /* never break the server over this */
      }
    },
  };
}

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
          // Vite 7 injects its modulepreload machinery into the client entry:
          // - `vite/modulepreload-polyfill` (legacy relList fallback)
          // - `vite/preload-helper` (`__vitePreload`), which is shared by the
          //   eagerly-loaded entry AND every lazy chunk.
          // Both must live in an eagerly-preloaded chunk (react-vendor), NOT
          // beside jspdf/html2canvas. If the preload-helper lands in vendor-pdf,
          // the entry statically imports vendor-pdf just for the helper and
          // every first-time visitor pays ~167K gzipped for PDF code via
          // <link rel="modulepreload">. See "lazy-load PDF vendor chunk".
          if (id.includes('vite/preload-helper') || id.includes('vite/modulepreload-polyfill')) {
            return 'react-vendor';
          }
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
    backupDaemonSupervisor(),
    // SLICE 151 — the dev listener gets the SAME limiter as prod-server.ts.
    // Without this the working site had no rate limiting at all.
    devRateLimitPlugin(),
    dataDirBootHook(),
    tailwindcss(),
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tanstackRouterGenerator(),
    viteReact(),
  ],
});
