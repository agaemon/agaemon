# Agaemon

Agaemon is the public release of AgentOS Kernel: an EVM execution kernel for AI
agents that need controlled onchain action review.

[![agaemon-workflow.png](https://i.postimg.cc/CMmhZV7K/agaemon-workflow.png)](https://postimg.cc/vDxFjkpR)

It is built for protocol teams, Web3 infrastructure builders, and agent
developers who want agents to propose or prepare onchain actions while policy
gates, verifier evidence, and safe operator review decide what can proceed. It
is not a retail wallet, token-trading product, or autonomous-yield system.

Its core rule is simple:

```text
AI proposes. Policy decides. Accounts execute.
```

Model output is never treated as authority. Agent or operator intent must be
compiled into typed actions, simulated through deterministic policy, and only
then executed through an agent account that enforces capability and policy
checks on-chain.

## Why This Exists

AI agents can generate useful actions, but they should not directly control
wallets, protocol calls, or funds. Agaemon provides the narrow execution layer
between AI intent and EVM execution:

```text
AI or operator intent
  -> off-chain runtime
  -> deterministic policy simulation
  -> agent account execution
  -> capability and policy enforcement
  -> protocol call
```

The current repository proves this boundary with Solidity contracts, TypeScript
runtime tooling, Base Sepolia operator workflows, local evidence artifacts, and
tests.

## Who This Is For

- Protocol teams choosing one testnet workflow for controlled execution review.
- Web3 infrastructure builders evaluating policy-gated agent execution.
- Agent developers proposing one capability adapter or policy template.
- Investors reviewing the Base Sepolia proof chain for the next milestone.

This public release does not target retail users, token traders, or autonomous
profit narratives.

## Current Scope

Implemented foundations:

- `AgentAccount` with owner/delegate execution, pause controls, reputation
  exposure, and capability-aware execution.
- `CapabilityRegistry` allowlists approved capability/target pairs.
- `PolicyEngine` enforces per-action limits, daily limits, borrowing policy,
  token limits, swap limits, and capability checks.
- Runtime builders simulate actions before producing executable transaction
  requests.
- Base Sepolia deployment manifest and verification tooling.
- Proposal, review, approval, execution-handoff, broadcast, receipt, closeout,
  and finalization evidence flows.
- Launch gate, health checks, event indexer, security evidence, operator
  dashboard, SDK examples, durable memory evidence, and economic payout
  summaries.
- Funding-demo evidence bundle with review index and final status artifacts.

Non-goals for this repo state:

- No new blockchain.
- No live LLM authority path.
- No default mainnet or live-funds workflow.
- No private-key use unless a command explicitly documents a send or deployment
  path.

Base Sepolia is the active validation network.

## Repository Map

- [`src/`](src/) - Solidity contracts.
- [`runtime/`](runtime/) - TypeScript runtime, CLIs, verifiers, SDK helpers, and
  operator evidence builders.
- [`script/`](script/) - Foundry deployment and smoke-test scripts.
- [`test/`](test/) - Foundry contract tests and fuzz coverage.
- [`SECURITY.md`](SECURITY.md) - vulnerability reporting scope and safe
  research rules.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) - contribution expectations and license
  terms for inbound contributions.
- [`deployments/base-sepolia/latest.json`](deployments/base-sepolia/latest.json)
  - current non-secret Base Sepolia deployment manifest.

Internal planning notes and release evidence are intentionally kept outside the
public repository. [VALIDATION.md](VALIDATION.md) documents the public checkout
checks and release prerequisites; [COMMANDS.md](COMMANDS.md) lists package commands.

## Quick Start

Install dependencies:

```bash
npm install
```

Run TypeScript/runtime tests:

```bash
npm test
```

Run Solidity tests:

```bash
forge test
```

Run TypeScript checks:

```bash
npm run typecheck
```

## Base Sepolia Setup

Copy the environment template:

```bash
cp .env.example .env
```

For read-only Base Sepolia checks, set:

```bash
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASE_SEPOLIA_CHAIN_ID=84532
```

For deployment or explicit send paths only, also set a Base Sepolia test-wallet
private key:

```bash
PRIVATE_KEY=0xyour_base_sepolia_test_wallet_private_key
```

Do not use a wallet that holds mainnet funds.

Check required environment values by workflow scope:

```bash
npm run base:env-check
npm run base:env-check -- --scope readiness
npm run base:env-check -- --scope broadcast
```

Secret values are never printed.

## Delegate Revocation

The owner can grant with `delegate(address)` and revoke with
`revokeDelegate(address)`. Revocation works while paused, affects only the
specified delegate, and emits `DelegateSet(delegate, false)`. Repeating a
revocation is safe; granting again explicitly restores that delegate. Clearing
the owner's delegate entry does not remove the owner's own authority.

For an account deployed with revocation support, first simulate (replace
`DELEGATE_ADDRESS` with the address to revoke):

```bash
npm run base:agent-account -- --revoke-delegate DELEGATE_ADDRESS --manifest deployments/base-sepolia/latest.json
```

The default is a dry run, requiring only RPC access. Review the delegate,
account, and transaction before adding `--send` to submit with the account
owner's configured test-wallet key. A successful simulation is not revocation.
Send-mode success requires a successful receipt and a false delegate mapping at
`verifiedAtBlock`; output separates `delegateAllowedBefore` from
`delegateAllowedAfter`. Check the current mapping again before unpausing if
other owner transactions may have regranted authority in the meantime.

For emergency containment: pause, revoke the affected delegate, verify the
receipt and delegate state, then explicitly unpause. Revocation cannot undo
transactions completed or ordered before it. Use `--delegate ADDRESS` only
when intentionally granting authority again. `AGENT_DELEGATE` selects a state
read and never implicitly grants or revokes.

```bash
npm run base:agent-account-safety-check -- --manifest deployments/base-sepolia/latest.json
```

The safety check verifies owner-callable revocation and exact rejection of
non-owner and zero-address requests. These independent simulations do not
prove a stateful grant/revoke lifecycle; contract tests provide that proof.
Saved safety reports missing the revocation checks must be regenerated before
the health gate accepts them.

**Existing deployments are not upgraded by this change.** Previously deployed
accounts lack the revoke method and fail its preflight. They require a new
account deployment and a separately planned migration of policy, delegates,
balances, reputation, and address references. Do not unpause an affected legacy
account on the assumption that updating the runtime revoked its delegate.

## Core Verification Commands

Verify the checked-in Base Sepolia manifest against chain state:

```bash
npm run base:manifest-verify -- --summary
```

Run the read-only readiness gate:

```bash
npm run base:readiness
```

Create a local readiness checkpoint:

```bash
npm run base:readiness-checkpoint -- --output artifacts/base-sepolia-readiness-checkpoint.json
```

Replay and verify Agaemon / AgentOS Kernel events from Base Sepolia:

```bash
npm run base:event-index -- --manifest deployments/base-sepolia/latest.json --from-block 0 --output artifacts/base-event-index.json --format summary
npm run base:event-index-verify -- --index artifacts/base-event-index.json --manifest deployments/base-sepolia/latest.json --from-block 0 --output artifacts/base-event-index-verification.json --format summary
```

Serve a saved dashboard locally:

```bash
npm run base:operator-dashboard-serve -- --dashboard artifacts/operator-dashboard.json --host 127.0.0.1 --port 8787
```

The dashboard server reads a saved local dashboard artifact. It does not require
RPC, `PRIVATE_KEY`, mainnet access, signing, broadcasting, or live funds.

## SDK And Integration API

Generate local-only SDK examples:

```bash
npm run base:agent-sdk-examples -- --output artifacts/sdk/agentos-sdk-examples.json --format summary
```

Verify the catalog:

```bash
npm run base:agent-sdk-examples-verify -- --catalog artifacts/sdk/agentos-sdk-examples.json --output artifacts/sdk/agentos-sdk-examples-verification.json --format summary
```

Serve the local integration API:

```bash
npm run base:agent-sdk-serve -- --host 127.0.0.1 --port 8788
```

The API exposes `/api/sdk/examples`, `/api/sdk/examples/verify`, and `/healthz`
without RPC, private keys, mainnet access, signing, broadcasting, or live funds.

## Development Standards

Before calling a change ready, run:

```bash
npm run typecheck
npm test
forge test
git diff --check
```

## Security Boundary

Agaemon is designed around a strict trust boundary:

- AI proposes actions.
- Runtime tooling serializes and verifies evidence.
- Deterministic policy decides whether an action is allowed.
- Agent accounts execute only after capability and policy checks pass.

The local dashboards, SDK APIs, funding-demo artifacts, and verification reports
are evidence surfaces. They do not create execution authority.

For vulnerability reporting and safe research scope, see
[`SECURITY.md`](SECURITY.md). Mainnet promotion is intentionally separate from
this public testnet proof.

## License

Agaemon / AgentOS Kernel is licensed under the MIT License. See
[`LICENSE`](LICENSE).
