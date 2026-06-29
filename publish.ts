import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync } from "node:fs";
import http from "node:http";
import path from "node:path";

const PORT = 3000;
const POLL_INTERVAL = 200; // ms
const MAX_POLLS = 50;
const RUN_DIR = path.join(process.cwd(), ".run");
const LOG_FILE = path.join(RUN_DIR, "server.log");

function log(message: string) {
  console.log(`[publish] ${message}`);
}

function error(message: string) {
  console.error(`[publish] ERROR: ${message}`);
  process.exit(1);
}

async function main() {
  log("Starting publication process...");

  // 1. Run build
  log("Building the site...");
  try {
    execSync("bun run build", { stdio: "inherit" });
  } catch (err) {
    error("Build failed.");
  }

  // 2. Kill existing process on port 3000
  log("Ensuring port 3000 is free...");
  try {
    // This command is safe even if nothing is listening
    execSync(`sudo lsof -t -iTCP:${PORT} -sTCP:LISTEN | xargs -r kill`, { stdio: "ignore" });
  } catch (err) {
    // Ignore errors if port is already free
  }

  // 3. Start the production server
  if (!existsSync(RUN_DIR)) {
    mkdirSync(RUN_DIR, { recursive: true });
  }

  log(`Starting server, logging to ${LOG_FILE}...`);
  const out = openSync(LOG_FILE, "a");
  const err = openSync(LOG_FILE, "a");

  const serverProcess = spawn("bun", ["run", "start"], {
    detached: true,
    stdio: ["ignore", out, err],
  });

  serverProcess.unref();

  // 4. Poll http://localhost:3000
  log("Polling server for readiness...");
  let success = false;
  for (let i = 1; i <= MAX_POLLS; i++) {
    try {
      const isReady = await new Promise<boolean>((resolve) => {
        const req = http.get(`http://localhost:${PORT}`, (res) => {
          // Any response (even 404) means the server is up
          resolve(true);
        });
        req.on("error", () => resolve(false));
        req.end();
      });

      if (isReady) {
        success = true;
        break;
      }
    } catch (e) {
      // Ignore errors during polling
    }
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
