# Goal: AgentOS Kernel Becomes A Credible Funding-Ready AI x Blockchain Proof

## Stage 0 - Build To Spec (Inner Loop)

Implement `spec.md`. Make the test suite pass before optimizing against the
eval. Do not score against the eval until these checks are green:

```bash
npm run typecheck
npm test
forge test
npm run base:security-evidence -- --test-dir test --format summary
npm run base:local-preflight -- --dir docs/releases --manifest deployments/base-sepolia/latest.json --env-example .env.example --status docs/releases/latest.json --format summary
```

Tests stay green every cycle thereafter.

## Target (Outer Loop)

Metric: weighted funding-readiness score with both failure directions penalized.
The score rewards technical evidence depth, live Base Sepolia release gates,
clear operator-demo usability, final funding-demo status verification, and
trust-boundary preservation. It penalizes missing evidence, stale artifacts,
demo copy without executable backing,
mainnet drift, private-key leakage, scorer edits, eval memorization, and any
weakening of:

```text
AI proposes. Policy decides. Accounts execute.
```

Score with:

```bash
harness/score.sh
```

Bar: `0.90` on holdout. A `VOID` result means a constraint was violated; find
and remove the violation. The harness will not tell you which hidden constraint
was tripped. Holdout is aggregate-only, max 3 calls per 24 hours. Acceptance is
measured on holdout exclusively.

## Constraints

- Wall-clock budget: 180 minutes. Check `harness/status.sh` every cycle. It
  shows elapsed time, projected spend, score history, git state, and whether
  live RPC is available.
- Spend ceilings: 0 USD for paid APIs, crawlers, hosted infra, or paid model
  calls beyond the active Codex session. Public web and Chrome research are
  allowed.
- Surface: this repo, generated `artifacts/`, hidden evals supplied by the
  harness owner, and the Obsidian project notes under
  `/Users/ibitcoinist/Documents/Se7en/Se7en/Codex/Projects/AgentOS Kernel`.
  Everything else is off-limits.
- Network: Base Sepolia/testnet only. Mainnet, Base mainnet, live funds, and
  wallets that hold mainnet funds are denied.
- Live gate: the run may require `BASE_SEPOLIA_RPC_URL`; the harness must not
  require `PRIVATE_KEY`, local signing, or transaction submission.
- Capacity caps: operator-demo command list <= 35 commands; funding narrative
  keyword glossary <= 20 entries; special-case branches for scoring/demo
  content <= 0; seed or fixture cases copied from eval <= 0.
- `goal.md`, `spec.md`, `harness/`, and `eval/` are read-only after launch.
  Eval inputs may be read where the harness exposes them; eval answers never.

## Cycle Protocol

1. Score dev:

   ```bash
   harness/score.sh
   ```

2. Reflect with:

   ```bash
   harness/probe.sh
   ```

   If the probe gap is growing, the next change must remove an eval-shaped
   artifact, not add one.

3. Log hypothesis, expected failure mode, and diagnostic in `LOG.md` before
   changing code.
4. Change the smallest useful surface.
5. Log the result in `LOG.md`.
6. Checkpoint every cycle:

   ```bash
   git add -A && git commit -m "cycle <n>: <score>"
   ```

## Entropy Rules

- Stall rule: if the metric did not move last cycle, the next attempt must be a
  structural change. Same-knob-harder is banned.
- Exploration quota: every 3 cycles, try a structurally different approach even
  if the current path is improving.
- Demo entropy: at least one cycle must test the proof from a cold operator's
  perspective: start from docs, run commands, inspect artifacts, and record
  where the workflow is unclear.

## Cheat Fences

- Do not edit `goal.md`, `spec.md`, `harness/`, or `eval/` after launch.
  Detection: `harness/lint.sh` voids dirty or changed read-only surfaces.
- Do not add Base mainnet implementation, manifests, workflows, package
  scripts, or environment variables. Detection: lint scans implementation and
  CI surfaces for mainnet drift.
- Do not introduce `PRIVATE_KEY` or `--send` into the demo, harness, or
  acceptance path. Detection: lint scans the LFD surfaces and scorer commands.
- Do not hardcode eval case IDs, canaries, or hidden-answer strings. Detection:
  lint performs non-revealing overlap checks and returns only `VOID`.
- Do not optimize a copy deck without executable evidence. Detection: score
  weights live gate artifacts and dashboard verification, not narrative alone.
- Do not create a lookup table of funding-readiness phrases. Detection:
  capacity caps and `harness/probe.sh` report memorization pressure.
- Do not declare victory on dev. Detection: acceptance is holdout-only.
- Do not mine holdout feedback. Detection: holdout returns aggregate score only
  and logs calls to the hidden audit log.
- Do not let model output become authority. Detection: score and lint penalize
  changes that bypass policy, capability, account, or launch-gate checks.
- Do not hide failing release gates behind screenshots or prose. Detection:
  score reads machine artifacts, funding status, and verifier outputs.

## Stop Conditions

Stop when the holdout bar is hit, any budget is exhausted, or marginal gain is
approximately 0 for 3 consecutive cycles. On stop, write a final report in
`LOG.md`: best score, what generalized, what was abandoned, trust-boundary
status, Base Sepolia evidence links, and highest-leverage next steps.
