#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  نشر الووركر السحابي الاحتياطي casino-api من cf-worker/worker.js
#  الاستعمال:  CLOUDFLARE_API_TOKEN=... bash scripts/deploy-casino-api.sh
#  (يحتاج كذلك CLOUDFLARE_ACCOUNT_ID — الافتراضي حساب المنصة أدناه)
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")/../cf-worker"
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-758fcc827f3338772847c28391b6c6c3}"
: "${CLOUDFLARE_API_TOKEN:?ضع CLOUDFLARE_API_TOKEN أولاً}"
echo "── نشر casino-api (حساب $CLOUDFLARE_ACCOUNT_ID)"
npx --yes wrangler@4 deploy
echo "── تحقق CORS للإنتاج:"
curl -s -o /dev/null -D - -H 'Origin: https://dtsg.pages.dev' \
  https://casino-api.dmgames-api.workers.dev/api/health | grep -i 'access-control-allow-origin' \
  && echo "   ✔ CORS يسمح لـ dtsg.pages.dev" || echo "   ✗ لا ترويسة CORS"
