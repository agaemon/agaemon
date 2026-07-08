#!/usr/bin/env bash
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="dev"
JSON_OUTPUT=0
for arg in "$@"; do
  case "$arg" in
    --holdout) MODE="holdout" ;;
    --dev) MODE="dev" ;;
    --json) JSON_OUTPUT=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

cd "$ROOT" || exit 2

if ! harness/lint.sh >/dev/null 2>&1; then
  echo "VOID: constraint violation"
  exit 2
fi

if [ -z "${BASE_SEPOLIA_RPC_URL:-}" ] && [ -f .env ]; then
  BASE_SEPOLIA_RPC_URL="$(sed -n 's/^BASE_SEPOLIA_RPC_URL=//p' .env | tail -1)"
  export BASE_SEPOLIA_RPC_URL
fi

RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="artifacts/lfd/$RUN_ID"
mkdir -p "$OUT_DIR"
holdout_audit_dir="${AGENTOS_LFD_AUDIT_DIR:-/Users/ibitcoinist/.codex/evals/agentos-funding-ready/audit}"
holdout_audit_file="$holdout_audit_dir/holdout-calls.jsonl"

if [ "$MODE" = "holdout" ]; then
  if [ -z "${AGENTOS_LFD_HOLDOUT_ANSWERS:-}" ] || [ ! -f "$AGENTOS_LFD_HOLDOUT_ANSWERS" ]; then
    echo "VOID: constraint violation"
    exit 2
  fi
  holdout_max_calls="${AGENTOS_LFD_HOLDOUT_MAX_CALLS:-3}"
  recent_holdout_calls="$(node - "$holdout_audit_file" <<'NODE'
const fs = require("fs");
const path = process.argv[2];
if (!fs.existsSync(path)) {
  console.log(0);
  process.exit(0);
}
const cutoff = Date.now() - 24 * 60 * 60 * 1000;
let count = 0;
for (const line of fs.readFileSync(path, "utf8").split(/\n/u)) {
  if (line.trim().length === 0) continue;
  try {
    const entry = JSON.parse(line);
    const generatedAt = Date.parse(entry.generatedAt);
    if (entry.mode === "holdout" && Number.isFinite(generatedAt) && generatedAt >= cutoff) count += 1;
  } catch {
    // Ignore malformed audit history; it cannot grant extra holdout calls.
  }
}
console.log(count);
NODE
)"
  if [ "$recent_holdout_calls" -ge "$holdout_max_calls" ]; then
    echo "VOID: constraint violation"
    exit 2
  fi
fi

LATEST_READINESS_RUN_URL="$(node - <<'NODE'
const fs = require("fs");
try {
  const status = JSON.parse(fs.readFileSync("docs/releases/latest.json", "utf8"));
  console.log(status.latest?.readinessRunUrl || "");
} catch {
  console.log("");
}
NODE
)"

score=0
total=121
declare -a checks

record_check() {
  local id="$1"
  local points="$2"
  local passed="$3"
  local note="$4"
  if [ "$passed" = "1" ]; then
    score=$((score + points))
    checks+=("{\"id\":\"$id\",\"points\":$points,\"passed\":true,\"note\":\"$note\"}")
  else
    checks+=("{\"id\":\"$id\",\"points\":$points,\"passed\":false,\"note\":\"$note\"}")
  fi
}

run_cmd() {
  local id="$1"
  local points="$2"
  shift 2
  local log="$OUT_DIR/$id.log"
  if "$@" >"$log" 2>&1; then
    record_check "$id" "$points" 1 "$log"
  else
    record_check "$id" "$points" 0 "$log"
  fi
}

run_cmd_json_passed() {
  local id="$1"
  local points="$2"
  local json="$3"
  shift 3
  local log="$OUT_DIR/$id.log"
  local stdout="$OUT_DIR/$id.stdout"
  if "$@" >"$stdout" 2>"$log"; then
    if [ ! -s "$json" ] && [ -s "$stdout" ]; then
      cp "$stdout" "$json"
    fi
  fi
  if [ -s "$json" ] && node - "$json" <<'NODE' >/dev/null 2>&1
const fs = require("fs");
const path = process.argv[2];
const value = JSON.parse(fs.readFileSync(path, "utf8"));
function objectChecksPass(checks) {
  if (!checks || typeof checks !== "object" || Array.isArray(checks)) return false;
  const vals = Object.values(checks);
  return vals.length > 0 && vals.every((v) => v === true);
}
function arrayChecksPass(checks) {
  return Array.isArray(checks) && checks.length > 0 && checks.every((v) => v && v.passed !== false);
}
const passed =
  value.passed === true ||
  value.overall === "passed" ||
  value.decision === "go" ||
  (value.schemaVersion === 1 && value.replay && typeof value.replay.indexedEventCount !== "undefined") ||
  (value.schemaVersion === 1 && value.launch?.passed === true && value.health?.passed === true) ||
  value.summary?.overall === "passed" ||
  value.summary?.failed === 0 ||
  value.readiness?.summary?.overall === "passed" ||
  objectChecksPass(value.checks) ||
  arrayChecksPass(value.checks);
process.exit(passed ? 0 : 1);
NODE
  then
    record_check "$id" "$points" 1 "$json"
  else
    record_check "$id" "$points" 0 "$log"
  fi
}

read_event_from_block() {
  node --input-type=module - <<'NODE'
import { readFileSync } from "node:fs";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";

try {
  const manifest = JSON.parse(readFileSync("deployments/base-sepolia/latest.json", "utf8"));
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL;
  const hash = manifest.transactions?.deployAgentAccount;
  if (!rpcUrl || !hash) throw new Error("missing event index inputs");
  const client = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  const receipt = await client.getTransactionReceipt({ hash });
  console.log(receipt.blockNumber.toString());
} catch {
  console.log("0");
}
NODE
}

run_cmd "typecheck" 6 npm --silent run typecheck
run_cmd "vitest" 10 npm test
run_cmd "foundry" 8 forge test
run_cmd_json_passed "security-evidence" 4 "$OUT_DIR/base-security-evidence.json" \
  npm --silent run base:security-evidence -- --test-dir test --output "$OUT_DIR/base-security-evidence.json"
run_cmd "funding-demo-reconciliations" 1 \
  npm --silent run base:funding-demo-reconciliations -- --output "$OUT_DIR/coordination-payout-reconciliations.json" --format summary
run_cmd "economic-payout-summary" 1 \
  npm --silent run base:economic-payout-summary -- --reconciliations "$OUT_DIR/coordination-payout-reconciliations.json" --output "$OUT_DIR/economic-payout-summary.json" --format summary
run_cmd_json_passed "economic-payout-summary-verify" 3 "$OUT_DIR/economic-payout-summary-verification.json" \
  npm --silent run base:economic-payout-summary-verify -- --summary "$OUT_DIR/economic-payout-summary.json" --reconciliations "$OUT_DIR/coordination-payout-reconciliations.json" --output "$OUT_DIR/economic-payout-summary-verification.json" --format summary

run_cmd_json_passed "env-example" 3 "$OUT_DIR/base-env-example.json" \
  npm --silent run base:env-example-verify -- --env-example .env.example
run_cmd_json_passed "local-preflight" 5 "$OUT_DIR/base-sepolia-local-preflight.json" \
  npm --silent run base:local-preflight -- --dir docs/releases --manifest deployments/base-sepolia/latest.json --env-example .env.example --status docs/releases/latest.json --output "$OUT_DIR/base-sepolia-local-preflight.json"
run_cmd_json_passed "release-note" 2 "$OUT_DIR/base-release-note-verify.json" \
  npm --silent run base:release-note-verify -- --release docs/releases/base-sepolia-2026-06-25-4c7e8c2.md --manifest deployments/base-sepolia/latest.json
run_cmd_json_passed "release-index" 1 "$OUT_DIR/base-release-index.json" \
  npm --silent run base:release-index -- --check --dir docs/releases --manifest deployments/base-sepolia/latest.json
run_cmd_json_passed "release-status" 1 "$OUT_DIR/base-release-status.json" \
  npm --silent run base:release-status -- --check --dir docs/releases --manifest deployments/base-sepolia/latest.json
run_cmd_json_passed "release-summary" 2 "$OUT_DIR/base-release-summary.json" \
  npm --silent run base:release-summary -- --check --status docs/releases/latest.json --output docs/releases/CURRENT.md

if [ -n "${BASE_SEPOLIA_RPC_URL:-}" ]; then
  run_cmd_json_passed "readiness-checkpoint" 8 "$OUT_DIR/base-sepolia-readiness-checkpoint.json" \
    npm --silent run base:readiness-checkpoint -- --readiness-run-url "${AGENTOS_LFD_READINESS_RUN_URL:-$LATEST_READINESS_RUN_URL}" --output "$OUT_DIR/base-sepolia-readiness-checkpoint.json"
  run_cmd_json_passed "agent-account-safety" 2 "$OUT_DIR/base-agent-account-safety.json" \
    npm --silent run base:agent-account-safety-check
  run_cmd_json_passed "health" 4 "$OUT_DIR/base-sepolia-health.json" \
    npm --silent run base:health -- --manifest deployments/base-sepolia/latest.json --status docs/releases/latest.json --agent-account-safety "$OUT_DIR/base-agent-account-safety.json" --output "$OUT_DIR/base-sepolia-health.json"
  run_cmd_json_passed "health-verify" 2 "$OUT_DIR/base-sepolia-health-verification.json" \
    npm --silent run base:health-verify -- --health "$OUT_DIR/base-sepolia-health.json" --manifest deployments/base-sepolia/latest.json --status docs/releases/latest.json --output "$OUT_DIR/base-sepolia-health-verification.json"
  run_cmd_json_passed "launch-gate" 4 "$OUT_DIR/base-sepolia-launch-gate.json" \
    npm --silent run base:launch-gate -- --manifest deployments/base-sepolia/latest.json --checkpoint "$OUT_DIR/base-sepolia-readiness-checkpoint.json" --local-preflight "$OUT_DIR/base-sepolia-local-preflight.json" --status docs/releases/latest.json --health "$OUT_DIR/base-sepolia-health.json" --security-evidence "$OUT_DIR/base-security-evidence.json" --economic-payout-summary-verification "$OUT_DIR/economic-payout-summary-verification.json" --output "$OUT_DIR/base-sepolia-launch-gate.json"
  run_cmd_json_passed "launch-gate-verify" 4 "$OUT_DIR/base-sepolia-launch-gate-verification.json" \
    npm --silent run base:launch-gate-verify -- --launch-gate "$OUT_DIR/base-sepolia-launch-gate.json" --manifest deployments/base-sepolia/latest.json --health "$OUT_DIR/base-sepolia-health.json" --local-preflight "$OUT_DIR/base-sepolia-local-preflight.json" --security-evidence "$OUT_DIR/base-security-evidence.json" --economic-payout-summary-verification "$OUT_DIR/economic-payout-summary-verification.json" --output "$OUT_DIR/base-sepolia-launch-gate-verification.json"
  EVENT_FROM_BLOCK="${AGENTOS_LFD_EVENT_FROM_BLOCK:-$(read_event_from_block)}"
  EVENT_TO_BLOCK="${AGENTOS_LFD_EVENT_TO_BLOCK:-$((EVENT_FROM_BLOCK + 9))}"
  run_cmd_json_passed "event-index" 2 "$OUT_DIR/base-event-index.json" \
    npm --silent run base:event-index -- --manifest deployments/base-sepolia/latest.json --from-block "$EVENT_FROM_BLOCK" --to-block "$EVENT_TO_BLOCK" --output "$OUT_DIR/base-event-index.json"
  run_cmd_json_passed "event-index-verify" 2 "$OUT_DIR/base-event-index-verification.json" \
    npm --silent run base:event-index-verify -- --index "$OUT_DIR/base-event-index.json" --manifest deployments/base-sepolia/latest.json --from-block "$EVENT_FROM_BLOCK" --to-block "$EVENT_TO_BLOCK" --output "$OUT_DIR/base-event-index-verification.json"
else
  record_check "readiness-checkpoint" 8 0 "BASE_SEPOLIA_RPC_URL missing"
  record_check "agent-account-safety" 2 0 "BASE_SEPOLIA_RPC_URL missing"
  record_check "health" 4 0 "BASE_SEPOLIA_RPC_URL missing"
  record_check "health-verify" 2 0 "BASE_SEPOLIA_RPC_URL missing"
  record_check "launch-gate" 4 0 "BASE_SEPOLIA_RPC_URL missing"
  record_check "launch-gate-verify" 4 0 "BASE_SEPOLIA_RPC_URL missing"
  record_check "event-index" 2 0 "BASE_SEPOLIA_RPC_URL missing"
  record_check "event-index-verify" 2 0 "BASE_SEPOLIA_RPC_URL missing"
fi

run_cmd "memory-storage-binding" 1 \
  npm --silent run base:memory-storage-binding -- --manifest deployments/base-sepolia/latest.json --storage-dir "$OUT_DIR/memory-store" --memory-id-label agentos.memory.funding-demo --content "AgentOS funding demo memory evidence" --output "$OUT_DIR/memory-storage-binding.json" --format summary
run_cmd_json_passed "memory-storage-binding-verify" 1 "$OUT_DIR/memory-storage-binding-verification.json" \
  npm --silent run base:memory-storage-binding-verify -- --binding "$OUT_DIR/memory-storage-binding.json" --output "$OUT_DIR/memory-storage-binding-verification.json" --format summary
run_cmd "memory-storage-binding-migrated" 1 \
  npm --silent run base:memory-storage-binding -- --manifest deployments/base-sepolia/latest.json --storage-dir "$OUT_DIR/memory-store-migrated" --memory-id-label agentos.memory.funding-demo --content "AgentOS funding demo memory evidence" --output "$OUT_DIR/memory-storage-binding-migrated.json" --format summary
run_cmd_json_passed "memory-storage-migration-verify" 2 "$OUT_DIR/memory-storage-migration-verification.json" \
  npm --silent run base:memory-storage-migration-verify -- --from "$OUT_DIR/memory-storage-binding.json" --to "$OUT_DIR/memory-storage-binding-migrated.json" --output "$OUT_DIR/memory-storage-migration-verification.json" --format summary

run_cmd_json_passed "operator-dashboard" 5 "$OUT_DIR/operator-dashboard.json" \
  npm --silent run base:operator-dashboard -- --manifest deployments/base-sepolia/latest.json --launch-gate "$OUT_DIR/base-sepolia-launch-gate.json" --health "$OUT_DIR/base-sepolia-health.json" --release-status docs/releases/latest.json --event-index "$OUT_DIR/base-event-index.json" --event-index-verification "$OUT_DIR/base-event-index-verification.json" --economic-payout-summary "$OUT_DIR/economic-payout-summary.json" --economic-payout-summary-verification "$OUT_DIR/economic-payout-summary-verification.json" --memory-storage-binding "$OUT_DIR/memory-storage-binding.json" --memory-storage-binding-verification "$OUT_DIR/memory-storage-binding-verification.json" --memory-storage-migration-verification "$OUT_DIR/memory-storage-migration-verification.json" --output "$OUT_DIR/operator-dashboard.json"
run_cmd_json_passed "operator-dashboard-verify" 5 "$OUT_DIR/operator-dashboard-verification.json" \
  npm --silent run base:operator-dashboard-verify -- --dashboard "$OUT_DIR/operator-dashboard.json" --manifest deployments/base-sepolia/latest.json --launch-gate "$OUT_DIR/base-sepolia-launch-gate.json" --health "$OUT_DIR/base-sepolia-health.json" --release-status docs/releases/latest.json --event-index "$OUT_DIR/base-event-index.json" --event-index-verification "$OUT_DIR/base-event-index-verification.json" --economic-payout-summary "$OUT_DIR/economic-payout-summary.json" --economic-payout-summary-verification "$OUT_DIR/economic-payout-summary-verification.json" --memory-storage-binding "$OUT_DIR/memory-storage-binding.json" --memory-storage-binding-verification "$OUT_DIR/memory-storage-binding-verification.json" --memory-storage-migration-verification "$OUT_DIR/memory-storage-migration-verification.json" --output "$OUT_DIR/operator-dashboard-verification.json"
run_cmd "operator-dashboard-html" 1 \
  npm --silent run base:operator-dashboard-html -- --dashboard "$OUT_DIR/operator-dashboard.json" --output "$OUT_DIR/operator-dashboard.html" --format summary
run_cmd "funding-proof-demo" 2 \
  npm --silent run base:funding-proof-demo -- --launch-gate "$OUT_DIR/base-sepolia-launch-gate.json" --health "$OUT_DIR/base-sepolia-health.json" --release-status docs/releases/latest.json --event-index "$OUT_DIR/base-event-index.json" --event-index-verification "$OUT_DIR/base-event-index-verification.json" --economic-payout-summary-verification "$OUT_DIR/economic-payout-summary-verification.json" --dashboard "$OUT_DIR/operator-dashboard.json" --dashboard-verification "$OUT_DIR/operator-dashboard-verification.json" --output "$OUT_DIR/funding-ready-demo.json" --format summary
run_cmd_json_passed "funding-proof-demo-verify" 3 "$OUT_DIR/funding-ready-demo-verification.json" \
  npm --silent run base:funding-proof-demo-verify -- --demo "$OUT_DIR/funding-ready-demo.json" --launch-gate "$OUT_DIR/base-sepolia-launch-gate.json" --health "$OUT_DIR/base-sepolia-health.json" --release-status docs/releases/latest.json --event-index "$OUT_DIR/base-event-index.json" --event-index-verification "$OUT_DIR/base-event-index-verification.json" --economic-payout-summary-verification "$OUT_DIR/economic-payout-summary-verification.json" --dashboard "$OUT_DIR/operator-dashboard.json" --dashboard-verification "$OUT_DIR/operator-dashboard-verification.json" --output "$OUT_DIR/funding-ready-demo-verification.json" --format summary
run_cmd "funding-demo-evidence-manifest" 1 \
  npm --silent run base:funding-demo-evidence-manifest -- --artifact-root "$OUT_DIR" --manifest deployments/base-sepolia/latest.json --release-status docs/releases/latest.json --output "$OUT_DIR/evidence-manifest.json" --format summary
run_cmd "funding-demo-review-index" 1 \
  npm --silent run base:funding-demo-review-index -- --evidence-manifest "$OUT_DIR/evidence-manifest.json" --funding-proof "$OUT_DIR/funding-ready-demo.json" --funding-proof-verification "$OUT_DIR/funding-ready-demo-verification.json" --dashboard "$OUT_DIR/operator-dashboard.json" --output "$OUT_DIR/index.html" --format summary
run_cmd_json_passed "funding-demo-review-index-verify" 2 "$OUT_DIR/index-verification.json" \
  npm --silent run base:funding-demo-review-index-verify -- --review-index "$OUT_DIR/index.html" --evidence-manifest "$OUT_DIR/evidence-manifest.json" --funding-proof "$OUT_DIR/funding-ready-demo.json" --funding-proof-verification "$OUT_DIR/funding-ready-demo-verification.json" --dashboard "$OUT_DIR/operator-dashboard.json" --output "$OUT_DIR/index-verification.json" --format summary
run_cmd_json_passed "funding-demo-evidence-manifest-verify" 2 "$OUT_DIR/evidence-manifest-verification.json" \
  npm --silent run base:funding-demo-evidence-manifest-verify -- --evidence-manifest "$OUT_DIR/evidence-manifest.json" --artifact-root "$OUT_DIR" --deployment-manifest deployments/base-sepolia/latest.json --release-status docs/releases/latest.json --output "$OUT_DIR/evidence-manifest-verification.json" --format summary
run_cmd_json_passed "funding-demo-status" 2 "$OUT_DIR/status.json" \
  npm --silent run base:funding-demo-status -- --funding-proof "$OUT_DIR/funding-ready-demo.json" --funding-proof-verification "$OUT_DIR/funding-ready-demo-verification.json" --review-index-verification "$OUT_DIR/index-verification.json" --evidence-manifest-verification "$OUT_DIR/evidence-manifest-verification.json" --output "$OUT_DIR/status.json" --format summary
run_cmd_json_passed "funding-demo-status-verify" 2 "$OUT_DIR/status-verification.json" \
  npm --silent run base:funding-demo-status-verify -- --status "$OUT_DIR/status.json" --funding-proof "$OUT_DIR/funding-ready-demo.json" --funding-proof-verification "$OUT_DIR/funding-ready-demo-verification.json" --review-index-verification "$OUT_DIR/index-verification.json" --evidence-manifest-verification "$OUT_DIR/evidence-manifest-verification.json" --output "$OUT_DIR/status-verification.json" --format summary

if [ -f docs/demo/funding-ready-operator-demo.md ] &&
  rg -n "AI proposes\\. Policy decides\\. Accounts execute\\.|launch gate|operator dashboard|security evidence|BASE_SEPOLIA_RPC_URL|signer secret|transaction submission|what this proves" docs/demo/funding-ready-operator-demo.md >/dev/null 2>&1; then
  record_check "operator-demo-doc" 5 1 "docs/demo/funding-ready-operator-demo.md"
else
  record_check "operator-demo-doc" 5 0 "docs/demo/funding-ready-operator-demo.md missing or incomplete"
fi

record_check "trust-boundary-lint" 6 1 "harness/lint.sh"
if ! rg -n --glob '!harness/lint.sh' --glob '!harness/score.sh' "PRIVATE_KEY|--send" harness eval ${AGENTOS_LFD_SCAN_DEMO:-docs/demo} >/dev/null 2>&1; then
  record_check "no-key-send-harness" 4 1 "harness/eval clean"
else
  record_check "no-key-send-harness" 4 0 "harness/eval contains key or send surface"
fi

if [ "$MODE" = "holdout" ]; then
  hidden_score="$(node - "$AGENTOS_LFD_HOLDOUT_ANSWERS" "$ROOT" <<'NODE'
const fs = require("fs");
const path = require("path");
const [answersPath, root] = process.argv.slice(2);
const answers = JSON.parse(fs.readFileSync(answersPath, "utf8"));
let passed = 0;
let total = 0;
function read(p) {
  return fs.existsSync(path.join(root, p)) ? fs.readFileSync(path.join(root, p), "utf8") : "";
}
for (const check of answers.checks || []) {
  total += Number(check.points || 1);
  let ok = false;
  if (check.kind === "fileContains") {
    ok = read(check.path).includes(check.value);
  } else if (check.kind === "fileMissing") {
    ok = !fs.existsSync(path.join(root, check.path));
  } else if (check.kind === "fileExists") {
    ok = fs.existsSync(path.join(root, check.path));
  } else if (check.kind === "jsonEquals") {
    const obj = JSON.parse(read(check.path));
    const actual = check.selector.split(".").reduce((v, k) => v == null ? undefined : v[k], obj);
    ok = actual === check.value;
  }
  if (ok) passed += Number(check.points || 1);
}
console.log(total === 0 ? 1 : passed / total);
NODE
)"
  score="$(node -e "const base=$score/$total; const hidden=Number(process.argv[1]); console.log(Math.round(((base*0.7)+(hidden*0.3))*100));" "$hidden_score")"
fi

normalized="$(node -e "console.log(($score/$total).toFixed(4))")"
generated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
summary="$(IFS=,; echo "${checks[*]}")"
full_report="{\"mode\":\"$MODE\",\"generatedAt\":\"$generated_at\",\"score\":$normalized,\"points\":$score,\"total\":$total,\"artifactDir\":\"$OUT_DIR\",\"checks\":[${summary}]}"
if [ "$MODE" = "holdout" ]; then
  report="{\"mode\":\"holdout\",\"generatedAt\":\"$generated_at\",\"score\":$normalized}"
else
  report="$full_report"
fi
echo "$report" > "$OUT_DIR/report.json"
mkdir -p artifacts/lfd
printf '%s\n' "$report" >> artifacts/lfd/score-history.jsonl

if [ "$MODE" = "holdout" ]; then
  mkdir -p "$holdout_audit_dir"
  printf '%s\n' "$full_report" >> "$holdout_audit_file"
fi

if [ "$JSON_OUTPUT" -eq 1 ]; then
  echo "$report"
else
  echo "$normalized"
fi
