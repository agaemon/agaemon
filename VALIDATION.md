# Public checkout validation

Run these checks from a clean checkout with Node.js 24 and Foundry installed:

```sh
npm ci
npm run typecheck
npm test
forge test
git diff --check
```

`npm ci` installs the committed dependency lockfile. The test suites validate
contracts, runtime behavior, public documentation, and the checked-in CI workflow.
No mainnet, no live funds, no signer secret, and no transaction submission.

The public workflow is `.github/workflows/ci.yml`. It runs on pushes and pull
requests with read-only repository permissions. It runs the complete runtime and
contract suites without RPC credentials, release snapshots, or private docs.
Passing it establishes local code/test correctness, not deployed-account or
release readiness.

## Release and funding-demo evidence

Internal release notes, saved release evidence, and live Base Sepolia automation
are not shipped in this public repository. They are not required by `npm test`.
The older `base-sepolia-*.yml` live workflows are not provided or scheduled here.

Runtime verifiers and their fixture-based tests remain available. To use
`base:local-preflight`, `base:health`, `base:launch-gate`, or funding-demo commands,
supply current account-specific manifests and release/economic evidence through
their existing file flags. Their historical `docs/releases` defaults do not imply
those files are bundled. Missing evidence must remain a failure; do not invent
passing release records or substitute local test success for live verification.

Funding-demo preparation requires verified economic evidence before launch-gate
verification, plus event-index, dashboard, and funding-proof evidence. Inspect
the CLI inputs in [COMMANDS.md](COMMANDS.md) before preparing an operator runbook.
An owner-authorized deployment or transaction is a separate action.
