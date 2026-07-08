#!/usr/bin/env bash
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUDGET_SECONDS="${AGENTOS_LFD_WALL_CLOCK_SECONDS:-10800}"
START_FILE="${AGENTOS_LFD_START_FILE:-$ROOT/artifacts/lfd/started_at}"
mkdir -p "$ROOT/artifacts/lfd"
mkdir -p "$(dirname "$START_FILE")"

if [ ! -f "$START_FILE" ]; then
  date -u +%s > "$START_FILE"
fi

start="$(cat "$START_FILE")"
now="$(date -u +%s)"
elapsed=$((now - start))
remaining=$((BUDGET_SECONDS - elapsed))
if [ "$remaining" -lt 0 ]; then remaining=0; fi

cd "$ROOT" || exit 2

echo "started_at_epoch: $start"
echo "elapsed_seconds: $elapsed"
echo "wall_clock_budget_seconds: $BUDGET_SECONDS"
echo "remaining_seconds_of_180m_budget: $remaining"
echo "paid_spend_usd: 0"
echo "paid_spend_ceiling_usd: 0"
if [ -n "${BASE_SEPOLIA_RPC_URL:-}" ] || { [ -f .env ] && sed -n 's/^BASE_SEPOLIA_RPC_URL=//p' .env | grep -q .; }; then
  echo "base_sepolia_rpc_url: present"
else
  echo "base_sepolia_rpc_url: missing"
fi
echo "private_key_required_by_harness: no"
echo "web_chrome_research_allowed: yes"
echo "git_status:"
git status --short
echo "recent_scores:"
if [ -f artifacts/lfd/score-history.jsonl ]; then
  tail -5 artifacts/lfd/score-history.jsonl | node -e 'const fs=require("fs"); for (const line of fs.readFileSync(0,"utf8").trim().split(/\n/).filter(Boolean)) { const j=JSON.parse(line); console.log(`${j.generatedAt} ${j.mode} ${j.score} ${j.artifactDir || "aggregate-only"}`); }'
else
  echo "none"
fi
