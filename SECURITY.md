# Security Policy

Agaemon handles Web3 execution surfaces through the AgentOS Kernel codebase, so
security reports should be handled carefully even while the active validation
network is Base Sepolia.

## Supported Scope

Security reports are in scope when they affect:

- Solidity contracts under `src/`.
- Foundry deployment or verification scripts under `script/`.
- TypeScript runtime, CLI, verifier, dashboard, SDK, or evidence tooling under
  `runtime/`.
- Base Sepolia deployment manifests, launch gates, health checks, funding-demo
  evidence, or operator dashboards.
- Documentation that could cause unsafe key handling, unsupported mainnet use,
  or false execution authority assumptions.

## Current Network Boundary

Base Sepolia is the active validation network. Mainnet promotion is intentionally
separate and last in the launch-completion plan.

Do not report mainnet fund loss scenarios as exploitable Agaemon incidents
unless the report identifies an Agaemon-controlled mainnet deployment or an
explicit mainnet workflow in this repository.

## Reporting A Vulnerability

Prefer GitHub private vulnerability reporting for this repository. If that is
not available, open a minimal public issue that says a private security report
is needed, but do not include exploit details in the public issue.

When reporting, include:

- affected component or command,
- expected behavior,
- observed behavior,
- reproduction steps using testnet, local, or saved evidence only,
- relevant commit or release status,
- whether private keys, signing, broadcasting, or live funds are involved.

Do not include private keys, seed phrases, bearer tokens, RPC secrets, live
wallet material, or unpublished third-party vulnerabilities.

## Safe Research Guidelines

- Use local tests, saved artifacts, forks, or Base Sepolia/testnet flows.
- Do not access, move, or attempt to move funds you do not own.
- Do not attempt social engineering, phishing, denial of service, or spam.
- Do not submit transactions on mainnet as part of a report unless the project
  has explicitly authorized that scope in writing.
- Keep proof-of-concept code minimal and focused on the issue.

## Out Of Scope

- Testnet faucet availability or testnet token value.
- Issues caused only by an unavailable third-party RPC provider.
- Reports that require leaked secrets, compromised developer machines, or
  malicious dependency installation without an Agaemon-specific bug.
- Generic best-practice requests without a concrete exploit path.

## Security Boundary

The intended Agaemon trust boundary is:

```text
AI proposes. Policy decides. Accounts execute.
```

Reports that show model output bypassing deterministic policy, capability
allowlists, account authorization, pause controls, launch gates, or evidence
verification are high priority.
