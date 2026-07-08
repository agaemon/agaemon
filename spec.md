# Spec: Funding-Ready AgentOS Kernel Proof

## Objective

Turn AgentOS Kernel into a credible funding-ready AI x blockchain proof while
remaining strictly Base Sepolia/testnet only.

The proof must convince a technical funder that AgentOS is not an AI wrapper
around a wallet. It is an evidence-backed execution kernel where untrusted AI
or operator intent is converted into deterministic, policy-gated execution
evidence.

## Fixed Trust Boundary

The core invariant is:

```text
AI proposes. Policy decides. Accounts execute.
```

The autonomous run must not weaken this boundary. Model output, generated
plans, dashboard data, and demo copy are never authority. Every proposed action
must remain downstream of deterministic policy simulation, capability checks,
account authorization, and explicit operator evidence.

## Scope

Allowed:

- Base Sepolia and local testnet evidence.
- Read-only RPC through `BASE_SEPOLIA_RPC_URL`.
- Local docs, tests, runtime, dashboard/API, demo, and Obsidian project notes.
- Public web or Chrome research for positioning, provided no private data or
  paid API spend is used.
- Hidden holdout evaluation outside the repo, supplied by the harness owner.

Denied:

- Mainnet deployment or Base mainnet implementation work.
- Live funds or wallets that hold mainnet funds.
- Any local private-key path in the acceptance harness.
- Any new automatic signing or transaction-submission path.
- Any change that lets AI/model output bypass deterministic policy, account, or
  capability enforcement.

## Required Product Outcome

The repo must contain a funding-ready proof package with all of the following:

1. A green local and live Base Sepolia evidence chain.
2. A release gate that returns `go` only when readiness, health, local preflight,
   release evidence, manifest consistency, and security evidence pass.
3. A read-only operator demo artifact that a technical investor can run or read
   without CLI expertise.
4. A dashboard or dashboard snapshot that links every launch-critical status to
   source evidence.
5. A compact funding-demo status artifact, plus independent status
   verification, that summarizes the final proof bundle without replacing the
   underlying machine evidence.
6. A narrative that explains the trust boundary, why Base Sepolia is sufficient
   for this proof, and what is deliberately not implemented.
7. Obsidian project notes updated with the new proof package and remaining
   open questions.

## Inner-Loop Acceptance

Before optimizing against the outer score, the run must keep these checks green:

```bash
npm run typecheck
npm test
forge test
npm run base:security-evidence -- --test-dir test --format summary
npm run base:local-preflight -- --dir docs/releases --manifest deployments/base-sepolia/latest.json --env-example .env.example --status docs/releases/latest.json --format summary
```

## Operator Demo Requirements

Create a repo-local operator demo under `docs/demo/` or an equivalent
operator-facing path. It must:

- Show the exact command sequence for generating Base Sepolia evidence.
- Include tests, security evidence, health, launch gate, event index, and
  operator dashboard steps.
- State `.env` impact for every step.
- State that `PRIVATE_KEY` and `--send` are not part of the demo.
- State the trust boundary in plain language.
- Link to source evidence files or generated artifacts.
- Include a short "what this proves" section aimed at technical funders.

## Outer-Loop Acceptance

The final outcome is accepted only when:

- `harness/score.sh --holdout` reports at least `0.90`.
- No score is `VOID`.
- All mandatory tests and release gates pass.
- The live Base Sepolia gate uses `BASE_SEPOLIA_RPC_URL`.
- The funding-demo status verifier passes over the generated proof bundle.
- The demo is clear enough to stand alone for a technical funding review.
- The trust boundary is preserved.
