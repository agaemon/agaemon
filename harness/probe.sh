#!/usr/bin/env bash
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 2

score_json="$(harness/score.sh --json 2>/dev/null || true)"
dev_score="$(node -e 'try { console.log(JSON.parse(process.argv[1]).score ?? 0) } catch { console.log(0) }' "$score_json")"

leaks=0
if rg -n "dev-tests-green|dev-release-gates|dev-operator-demo|dev-trust-boundary" \
  --glob '!eval/dev/cases.json' --glob '!harness/probe.sh' . >/dev/null 2>&1; then
  leaks=$((leaks + 1))
fi

if [ -f docs/demo/funding-ready-operator-demo.md ]; then
  command_count="$(rg -n "npm run|forge test|harness/" docs/demo/funding-ready-operator-demo.md | wc -l | tr -d ' ')"
else
  command_count=0
fi

command_cap=35
penalty="$(node -e 'const leaks=Number(process.argv[1]); const commands=Number(process.argv[2]); const cap=Number(process.argv[3]); let p=0; p += leaks * 0.15; if (commands > cap) p += 0.10; console.log(Math.min(0.4, p).toFixed(4));' "$leaks" "$command_count" "$command_cap")"
probe_score="$(node -e 'const dev=Number(process.argv[1]); const penalty=Number(process.argv[2]); console.log(Math.max(0, dev - penalty).toFixed(4));' "$dev_score" "$penalty")"
gap="$(node -e 'const dev=Number(process.argv[1]); const probe=Number(process.argv[2]); console.log(Math.max(0, dev - probe).toFixed(4));' "$dev_score" "$probe_score")"

cat <<EOF
dev_score: $dev_score
probe_score: $probe_score
probe_gap: $gap
eval_case_id_leaks: $leaks
operator_demo_command_count: $command_count
operator_demo_command_cap: $command_cap
EOF
