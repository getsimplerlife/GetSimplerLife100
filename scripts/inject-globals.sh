#!/bin/bash
# Inject globalThis.app before SSR server.js to prevent
# "globalThis.app.config" crashes in TanStack Start/Vinxi SSR.
SERVER_JS="dist/server/server.js"
if [ -f "$SERVER_JS" ]; then
  if ! head -1 "$SERVER_JS" | grep -q 'globalThis.*\.app'; then
    echo 'var _a;(globalThis).app=(globalThis).app||{config:{}};' | cat - "$SERVER_JS" > "$SERVER_JS.tmp"
    mv "$SERVER_JS.tmp" "$SERVER_JS"
    echo "[inject-globals] Added globalThis.app shim to server.js"
  else
    echo "[inject-globals] globalThis.app shim already present"
  fi
fi
