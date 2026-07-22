import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, copyFileSync, readdirSync } from "node:fs";
import http from "node:http";
import path from "node:path";

const PORT = 3000;
const POLL_INTERVAL = 200;
const MAX_POLLS = 50;
const RUN_DIR = path.join(process.cwd(), ".run");
const LOG_FILE = path.join(RUN_DIR, "server.log");
const PUBLIC_DIR = path.join(process.cwd(), "public");
const CLIENT_DIR = path.join(process.cwd(), "dist", "client");

function log(message: string) {
  console.log(`[publish] ${message}`);
}

function error(message: string) {
  console.error(`[publish] ERROR: ${message}`);
  process.exit(1);
}

async function main() {
  log("Starting publication process...");

  // Skip build — it hangs on SSR (sandbox memory constraint).
  // dist/server/server.js is manually authored (hydration-compatible shell).
  // dist/client/ holds the last successful client build (~795 modules in ~11s).
  // Run "bun run build:client" manually if client source files change.

  // Ensure dist/client exists with static files from public/
  if (!existsSync(CLIENT_DIR)) {
    mkdirSync(CLIENT_DIR, { recursive: true });
  }
  if (existsSync(PUBLIC_DIR)) {
    try {
      for (const f of readdirSync(PUBLIC_DIR)) {
        const src = path.join(PUBLIC_DIR, f);
        const dest = path.join(CLIENT_DIR, f);
        if (!existsSync(dest)) {
          copyFileSync(src, dest);
        }
      }
    } catch (err) {
      log("Warning: could not sync static assets");
    }
  }

  // Kill existing process on port 3000
  log("Ensuring port 3000 is free...");
  try {
    execSync(`sudo lsof -t -iTCP:${PORT} -sTCP:LISTEN | xargs -r kill`, { stdio: "ignore" });
  } catch {}

  // Start the production server
  if (!existsSync(RUN_DIR)) {
    mkdirSync(RUN_DIR, { recursive: true });
  }

  log(`Starting server, logging to ${LOG_FILE}...`);
  const out = openSync(LOG_FILE, "a");
  const errFd = openSync(LOG_FILE, "a");

  const serverProcess = spawn("bun", ["run", "start"], {
    detached: true,
    stdio: ["ignore", out, errFd],
  });
  serverProcess.unref();

  // Poll for readiness
  log("Polling server for readiness...");
  let success = false;
  for (let i = 1; i <= MAX_POLLS; i++) {
    try {
      const isReady = await new Promise<boolean>((resolve) => {
        const req = http.get(`http://localhost:${PORT}`, (_res) => resolve(true));
        req.on("error", () => resolve(false));
        req.end();
      });
      if (isReady) { success = true; break; }
    } catch {}
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }

  if (success) {
    log(`Site published; serving on port ${PORT}`);
    process.exit(0);
  } else {
    error(`Published, but the server isn't responding - check ${LOG_FILE}`);
  }
}

main();
