# Contributing

Agaemon welcomes focused contributions that preserve the project trust boundary.
Agaemon is the public release of the AgentOS Kernel codebase:

```text
AI proposes. Policy decides. Accounts execute.
```

## License Of Contributions

By submitting a contribution to this repository, you agree that your
contribution is licensed under the MIT License, the same license as the project.

## Contribution Guidelines

- Keep changes narrow and evidence-backed.
- Do not introduce mainnet, live-funds, private-key, or signing behavior unless
  the issue explicitly scopes that path.
- Add or update tests for behavior changes.
- Keep trust-critical code, policy checks, evidence schemas, and verifiers
  inspectable.
- Do not include secrets, private keys, seed phrases, or live wallet material.

## Public Trust Checklist

Before opening an issue or pull request, check whether the change affects the
public trust surface:

- security reporting or safe research expectations,
- open-source/commercial boundary,
- Base Sepolia or saved-evidence demo flow,
- policy, capability, verifier, or evidence-schema behavior,
- contributor-facing plugin or integration surfaces.

If it does, link the relevant docs or evidence in the issue or pull request.
Start with [`docs/public-trust.md`](docs/public-trust.md) and
[`SECURITY.md`](SECURITY.md).

Before opening a pull request, run the relevant local checks:

```bash
npm run typecheck
npm test
forge test
git diff --check
```
