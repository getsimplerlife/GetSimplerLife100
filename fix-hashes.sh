#!/bin/bash
# Fix hash mismatches between SSR HTML and actual dist files
# Run after build, before starting server
#
# Strategy:
# 1. Clean client/assets of stale files from previous builds
# 2. Mirror server/assets → client/assets (canonical from current build)
# 3. Bridge any SSR-referenced hashes not in the canonical set

DIST="/home/team/shared/site/dist"
SERVER="$DIST/server/server.js"
SERVER_ASSETS="$DIST/server/assets"
CLIENT_ASSETS="$DIST/client/assets"

if [ ! -f "$SERVER" ]; then exit 0; fi

mkdir -p "$CLIENT_ASSETS"

# Step 1: Remove stale client assets — only if newer version exists in server/assets
# First, collect SSR-referenced hashes from live pages (to preserve bridges)
SSR_SAFELIST="/home/team/shared/site/.tmp/ssr_safelist.txt"
> "$SSR_SAFELIST"
for page in "" "login" "register" "about" "contact" "faq" "demo" "how-it-works" "build" "case-studies" "support" "portal" "portal/dashboard" "portal/marketplace"; do
  curl -s "http://localhost:3000/$page" 2>/dev/null | strings | grep -oP '[a-zA-Z0-9_.-]+-[A-Za-z0-9_]{8,}\.(js|css)' >> "$SSR_SAFELIST"
done
sort -u "$SSR_SAFELIST" -o "$SSR_SAFELIST"

stale=0
for f in "$CLIENT_ASSETS"/*.js "$CLIENT_ASSETS"/*.css; do
  [ ! -f "$f" ] && continue
  name=$(basename "$f")
  if [ -f "$SERVER_ASSETS/$name" ]; then
    continue  # canonical file, keep
  fi
  # Keep if referenced by live SSR HTML
  if grep -qF "$name" "$SSR_SAFELIST" 2>/dev/null; then
    continue
  fi
  # Check if a newer version exists in server/assets with same base name
  base=$(echo "$name" | sed -E 's/-[A-Za-z0-9_]{8,}\.(js|css)$//')
  ext=$(echo "$name" | sed 's/.*\.//')
  if ls "$SERVER_ASSETS/${base}-"*".${ext}" >/dev/null 2>&1; then
    rm "$f"
    stale=$((stale + 1))
  fi
done
echo "  Cleaned $stale stale files"

# Step 2: Mirror server/assets → client/assets
copied=0
for f in "$SERVER_ASSETS"/*.js "$SERVER_ASSETS"/*.css; do
  [ ! -f "$f" ] && continue
  name=$(basename "$f")
  if [ ! -f "$CLIENT_ASSETS/$name" ]; then
    cp "$f" "$CLIENT_ASSETS/$name"
    copied=$((copied + 1))
  fi
done
echo "  Synced $copied files server→client"

# Step 3: Bridge SSR-referenced hashes that don't match server/assets
bridged=0
while read -r hash; do
  [ -z "$hash" ] && continue
  if [ -f "$CLIENT_ASSETS/$hash" ]; then
    continue
  fi
  base=$(echo "$hash" | sed -E 's/-[A-Za-z0-9_]{8,}\.(js|css)$//')
  ext=$(echo "$hash" | sed 's/.*\.//')
  real=$(ls "$CLIENT_ASSETS/${base}-"*".${ext}" 2>/dev/null | head -1)
  if [ -n "$real" ]; then
    cp "$real" "$CLIENT_ASSETS/$hash"
    echo "  Bridged: $hash → $(basename $real)"
    bridged=$((bridged + 1))
  fi
done < <(strings "$SERVER" | grep -oP '[a-zA-Z0-9_.-]+-[A-Za-z0-9_]{8,}\.(js|css)' | sort -u)

# Step 4: Bridge manifest-referenced hashes (client build hashes used for preloading)
# The manifest is separate from server.js — it contains client-build hashes
# that the SSR may use for `<link rel="modulepreload">` tags
# Use process substitution to avoid subshell variable scoping
manifest_bridged=0
MANIFEST=$(ls "$SERVER_ASSETS/_tanstack-start-manifest_v-"*.js 2>/dev/null | head -1)
if [ -n "$MANIFEST" ]; then
  while read -r hash; do
    [ -z "$hash" ] && continue
    if [ -f "$CLIENT_ASSETS/$hash" ]; then
      continue
    fi
    base=$(echo "$hash" | sed -E 's/-[A-Za-z0-9_]{8,}\.(js|css)$//')
    ext=$(echo "$hash" | sed 's/.*\.//')
    real=$(ls "$CLIENT_ASSETS/${base}-"*".${ext}" 2>/dev/null | head -1)
    if [ -n "$real" ]; then
      cp "$real" "$CLIENT_ASSETS/$hash"
      echo "  Bridged (manifest): $hash → $(basename $real)"
      manifest_bridged=$((manifest_bridged + 1))
    fi
  done < <(strings "$MANIFEST" | grep -oP '/assets/[a-zA-Z0-9_.-]+-[A-Za-z0-9_]{8,}\.(js|css)' | sed 's|/assets/||' | sort -u)
fi

# Step 5: Patch the server manifest itself — replace stale hashes inline
# The SSR loads this manifest at runtime and embeds hashes in HTML.
# Bridging client files (Step 4) isn't enough — the manifest text must change too.
manifest_patched=0
if [ -n "$MANIFEST" ]; then
  while read -r oldhash; do
    [ -z "$oldhash" ] && continue
    # Skip if the referenced file actually exists
    if [ -f "$CLIENT_ASSETS/$oldhash" ]; then continue; fi
    base=$(echo "$oldhash" | sed -E 's/-[A-Za-z0-9_]{8,}\.(js|css)$//')
    ext=$(echo "$oldhash" | sed 's/.*\.//')
    newhash_name=$(ls "$CLIENT_ASSETS/${base}-"*".${ext}" 2>/dev/null | head -1 | xargs basename 2>/dev/null)
    if [ -n "$newhash_name" ] && [ -f "$CLIENT_ASSETS/$newhash_name" ]; then
      sed -i "s|$oldhash|$newhash_name|g" "$MANIFEST"
      echo "  Patched (server manifest): $oldhash → $newhash_name"
      manifest_patched=$((manifest_patched + 1))
    fi
  done < <(strings "$MANIFEST" | grep -oP '/assets/[a-zA-Z0-9_.-]+-[A-Za-z0-9_]{8,}\.(js|css)' | sed 's|/assets/||' | sort -u)
fi

# Step 6: Copy React ESM shims to dist/client so prod-server can serve them
for shim in react.js react-jsx-runtime.js; do
  if [ -f "/home/team/shared/site/public/$shim" ]; then
    cp "/home/team/shared/site/public/$shim" "$DIST/client/$shim"
    echo "  Copied $shim to dist/client/"
  fi
done

echo "  Hash fix complete (clean=$stale sync=$copied bridged=$bridged manifest_bridged=$manifest_bridged manifest_patched=$manifest_patched)"
