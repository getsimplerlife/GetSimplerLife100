#!/bin/bash
# Fix hash mismatches between SSR HTML and actual dist files
# Run after build, before starting server
# 
# Strategy:
# 1. Copy real files to match hash names referenced in current SSR build
# 2. Also create fallback copies for common stale CDN hash patterns

DIST="/home/team/shared/site/dist"
SERVER="$DIST/server/server.js"
ASSETS="$DIST/client/assets"

if [ ! -f "$SERVER" ]; then exit 0; fi

# Step 1: Get all JS/CSS files referenced in SSR output and link them
strings "$SERVER" | grep -oP '[a-zA-Z0-9_.-]+-[A-Za-z0-9_]{8,}\.(js|css)' | sort -u | while read f; do
  if [ -f "$ASSETS/$f" ]; then
    continue
  fi
  # Find matching file by base name pattern (strip hash suffix)
  base=$(echo "$f" | sed -E 's/-[A-Za-z0-9_]{8,}\.(js|css)$//')
  ext=$(echo "$f" | sed 's/.*\.//')
  real=$(find "$DIST" -maxdepth 3 -name "${base}-*.${ext}" -type f 2>/dev/null | head -1)
  if [ -n "$real" ]; then
    mkdir -p "$ASSETS"
    cp "$real" "$ASSETS/$f"
    echo "  Linked (SSR): $f -> $(basename $real)"
  fi
done

# Step 2: For every real file in dist, ensure it's in client/assets
find "$DIST" -maxdepth 3 -name "*.js" -o -name "*.css" | while read real; do
  name=$(basename "$real")
  if [ ! -f "$ASSETS/$name" ]; then
    mkdir -p "$ASSETS"
    cp "$real" "$ASSETS/$name"
    echo "  Copied to assets: $name"
  fi
done

echo "Hash fix complete"
