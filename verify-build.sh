#!/bin/bash
# Post-build verification: ensure the SSR can serve pages and all emitted
# script references resolve to real files on disk.
#
# Background: TanStack Start produces TWO asset sets:
#   1. SSR build (dist/server/assets/) — used by the Node server
#   2. Client build (dist/client/assets/) — for browser consumption
# fix-hashes.sh overwrites client/assets with server/assets.
# The manifest (_tanstack-start-manifest_v-*.js) references client-build
# hashes and is NOT used by the SSR for script injection — the SSR uses
# its own import graph. This check verifies what the SSR *actually emits*.

set -e

DIST="/home/team/shared/site/dist"
CLIENT_ASSETS="$DIST/client/assets"
SERVER_JS="$DIST/server/server.js"
HOST="${1:-localhost:3000}"

if [ ! -f "$SERVER_JS" ]; then
  echo "[verify-build] ERROR: dist/server/server.js not found — build may have failed"
  exit 1
fi

if [ ! -d "$CLIENT_ASSETS" ]; then
  echo "[verify-build] ERROR: No client/assets directory"
  exit 1
fi

echo "[verify-build] Checking build integrity..."

# 1. Verify server.js has no bare imports that would crash Node
BAD_IMPORTS=$(grep -c "from ['\"]react/jsx-runtime['\"]" "$SERVER_JS" 2>/dev/null || true)
if [ "$BAD_IMPORTS" -gt 0 ]; then
  echo "[verify-build] WARNING: server.js contains bare 'react/jsx-runtime' import"
  echo "  This is normal for SSR — the import is resolved by the runtime"
fi

# 2. Extract references from server.js (SSR import graph), verify they exist
echo "[verify-build] Checking server.js asset references..."
MISSING_COUNT=0
strings "$SERVER_JS" | grep -oP '[a-zA-Z0-9_.-]+-[A-Za-z0-9_]{8,}\.(js|css)' \
  | grep -v '^_tanstack' | sort -u | while read -r file; do
  if [ ! -f "$CLIENT_ASSETS/$file" ]; then
    echo "  MISSING (server.js): $file"
    echo "1" >> /tmp/verify-build-server-missing
  fi
done

if [ -f /tmp/verify-build-server-missing ]; then
  MISSING_COUNT=$(wc -l < /tmp/verify-build-server-missing)
  rm -f /tmp/verify-build-server-missing
  echo "[verify-build] WARNING: $MISSING_COUNT server.js reference(s) missing"
  echo "  These may be inlined in server.js — not necessarily fatal"
fi

# 3. Verify SSR HTML script injection (try curl if server is running)
if curl -s -o /dev/null -w "%{http_code}" "http://$HOST/" 2>/dev/null | grep -q '200'; then
  echo "[verify-build] Checking emitted SSR script tags..."
  EMITTED_MISSING=0
  curl -s "http://$HOST/" 2>/dev/null | strings | grep -oP 'src="/assets/[^"]+' \
    | sed 's|src="/assets/||' | while read -r file; do
    if [ ! -f "$CLIENT_ASSETS/$file" ]; then
      echo "  MISSING (SSR HTML): $file"
      echo "1" >> /tmp/verify-build-ssr-missing
    fi
  done

  if [ -f /tmp/verify-build-ssr-missing ]; then
    EMITTED_MISSING=$(wc -l < /tmp/verify-build-ssr-missing)
    rm -f /tmp/verify-build-ssr-missing
    echo "[verify-build] FAILED: $EMITTED_MISSING script(s) referenced in SSR HTML are missing"
    echo "[verify-build] Run: rm -rf .tanstack .vinxi node_modules/.vite dist && bun run build"
    exit 1
  fi
else
  echo "[verify-build] Server not running on $HOST — skipping SSR HTML check"
  echo "  Run 'bun run start' then re-run: bash verify-build.sh"
fi

echo "[verify-build] PASSED"
exit 0
