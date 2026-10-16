#!/usr/bin/env bash
set -euo pipefail

OUT="cf-dist"
rm -rf "$OUT"
mkdir -p "$OUT"

cp index.html "$OUT/"
cp _worker.js "$OUT/"
cp _headers "$OUT/"

for dir in scripts styles recolor assets; do
  if [ -d "$dir" ]; then
    cp -R "$dir" "$OUT/$dir"
  fi
done

# Do not publish source/build metadata or repository internals.
cat > "$OUT/.assetsignore" <<'EOF'
_worker.js
_headers
.assetsignore
EOF

printf 'Cloudflare Pages output prepared in %s\n' "$OUT"
