# Operator command inventory

This is the checked command inventory for the public package. Commands are grouped
by their CLI source directory. Entries show invocation names, not a sequence to
run: most commands require input files or flags. Read the corresponding entry
point under `runtime/cli/<group>/` for its arguments. Never run the inventory as
a shell script. See [VALIDATION.md](VALIDATION.md) for the local validation flow.

The default public validation flow needs no RPC, wallet key, deployment, or
transaction submission. Release, health, funding-demo and broadcast commands
need separately supplied evidence and, where explicitly documented, testnet
configuration. Signing, submission, deployment and `--send` paths require explicit
operator authorization; inclusion here is not authorization to execute them.

## agentCore

Entry points: `runtime/cli/agentCore/`.

```text
npm run base:agent-account
npm run base:agent-account-safety-check
npm run base:agent-coordination
npm run base:agent-coordination-safety-check
npm run base:agent-directory
npm run base:agent-directory-safety-check
```

## agentPlanning

Entry points: `runtime/cli/agentPlanning/`.

```text
npm run base:agent-intent-plan
npm run base:agent-intent-proposal
npm run base:agent-plan-proposal
```

Plan and intent proposals check each action's policy independently. Their
`validationStatus` is `single-step-policy-allowed`, `policy-denied`, or
`sequence-unverified`. Only one allowed step receives `executable: true` and a
transaction payload; this is policy eligibility, not proof of successful execution.

Multi-step proposals retain all action details and policy decisions, but return
`executable: false` with every transaction set to `null`. The proposal CLIs still
print or write that diagnostic artifact and exit with code 1. Cumulative spending,
balance changes, and step dependencies need stateful sequence validation, which
is not implemented. Saved multi-step artifacts marked executable are rejected
by proposal verification and cannot enter the review-to-execution handoff. Legacy
single-step artifacts remain supported. Approval does not override these checks.

## base

Entry points: `runtime/cli/base/`.

```text
npm run base:checkpoint-verify
npm run base:execute
npm run base:local-preflight
npm run base:manifest-verify
npm run base:readiness
npm run base:readiness-checkpoint
```

## broadcast

Entry points: `runtime/cli/broadcast/`.

```text
npm run base:agent-proposal-execution-broadcast-archive
npm run base:agent-proposal-execution-broadcast-archive-verify
npm run base:agent-proposal-execution-broadcast-package
npm run base:agent-proposal-execution-broadcast-package-verify
npm run base:agent-proposal-execution-broadcast-preflight
npm run base:agent-proposal-execution-broadcast-receipt-verify
npm run base:agent-proposal-execution-broadcast-report
npm run base:agent-proposal-execution-broadcast-report-verify
npm run base:agent-proposal-execution-broadcast-submit
```

## broadcastCloseout

Entry points: `runtime/cli/broadcastCloseout/`.

```text
npm run base:agent-proposal-execution-broadcast-closeout
npm run base:agent-proposal-execution-broadcast-closeout-evidence-set-summary
npm run base:agent-proposal-execution-broadcast-closeout-evidence-set-summary-verify
npm run base:agent-proposal-execution-broadcast-closeout-evidence-set-verify
npm run base:agent-proposal-execution-broadcast-closeout-finalize
npm run base:agent-proposal-execution-broadcast-closeout-finalize-archive
npm run base:agent-proposal-execution-broadcast-closeout-finalize-archive-status
npm run base:agent-proposal-execution-broadcast-closeout-finalize-archive-status-summary
npm run base:agent-proposal-execution-broadcast-closeout-finalize-archive-status-summary-package
npm run base:agent-proposal-execution-broadcast-closeout-finalize-archive-status-summary-package-status
npm run base:agent-proposal-execution-broadcast-closeout-finalize-archive-status-summary-package-status-summary
npm run base:agent-proposal-execution-broadcast-closeout-finalize-archive-status-summary-package-status-summary-verify
npm run base:agent-proposal-execution-broadcast-closeout-finalize-archive-status-summary-package-status-verify
npm run base:agent-proposal-execution-broadcast-closeout-finalize-archive-status-summary-package-verify
npm run base:agent-proposal-execution-broadcast-closeout-finalize-archive-status-summary-verify
npm run base:agent-proposal-execution-broadcast-closeout-finalize-archive-status-verify
npm run base:agent-proposal-execution-broadcast-closeout-finalize-archive-verify
npm run base:agent-proposal-execution-broadcast-closeout-finalize-status
npm run base:agent-proposal-execution-broadcast-closeout-finalize-status-verify
npm run base:agent-proposal-execution-broadcast-closeout-finalize-verify
npm run base:agent-proposal-execution-broadcast-closeout-status
npm run base:agent-proposal-execution-broadcast-closeout-status-verify
npm run base:agent-proposal-execution-broadcast-closeout-verify
```

## economics

Entry points: `runtime/cli/economics/`.

```text
npm run base:economic-payout-summary
npm run base:economic-payout-summary-verify
npm run base:funding-demo-reconciliations
```

## env

Entry points: `runtime/cli/env/`.

```text
npm run base:env-check
npm run base:env-example-verify
```

## indexer

Entry points: `runtime/cli/indexer/`.

```text
npm run base:event-index
npm run base:event-index-verify
```

## launch

Entry points: `runtime/cli/launch/`.

```text
npm run base:health
npm run base:health-verify
npm run base:launch-gate
npm run base:launch-gate-verify
```

## memory

Entry points: `runtime/cli/memory/`.

```text
npm run base:agent-profile-memory
npm run base:agent-profile-memory-verify
npm run base:memory-commit
npm run base:memory-safety-check
npm run base:memory-storage-binding
npm run base:memory-storage-binding-verify
npm run base:memory-storage-migration-verify
npm run base:memory-store
```

## operator

Entry points: `runtime/cli/operator/`.

```text
npm run base:funding-demo-evidence-manifest
npm run base:funding-demo-evidence-manifest-verify
npm run base:funding-demo-review-index
npm run base:funding-demo-review-index-verify
npm run base:funding-demo-status
npm run base:funding-demo-status-verify
npm run base:funding-proof-demo
npm run base:funding-proof-demo-verify
npm run base:operator-dashboard
npm run base:operator-dashboard-html
npm run base:operator-dashboard-serve
npm run base:operator-dashboard-verify
```

## payments

Entry points: `runtime/cli/payments/`.

```text
npm run base:pay
npm run base:safety-check
```

## payouts

Entry points: `runtime/cli/payouts/`.

```text
npm run base:payout
npm run base:payout-safety-check
```

## proposal

Entry points: `runtime/cli/proposal/`.

```text
npm run base:agent-proposal-summary
npm run base:agent-proposal-summary-verify
npm run base:agent-proposal-verify
```

## proposalExecution

Entry points: `runtime/cli/proposalExecution/`.

```text
npm run base:agent-proposal-execution-bundle
npm run base:agent-proposal-execution-bundle-verify
npm run base:agent-proposal-execution-handoff
npm run base:agent-proposal-execution-handoff-verify
npm run base:agent-proposal-execution-manifest
npm run base:agent-proposal-execution-manifest-verify
npm run base:agent-proposal-execution-package
npm run base:agent-proposal-execution-package-verify
npm run base:agent-proposal-execution-preflight
npm run base:agent-proposal-execution-preview
npm run base:agent-proposal-execution-preview-verify
npm run base:agent-proposal-execution-readiness
npm run base:agent-proposal-execution-readiness-verify
npm run base:agent-proposal-execution-runbook
npm run base:agent-proposal-execution-runbook-verify
npm run base:agent-proposal-execution-signed-payload-verify
npm run base:agent-proposal-execution-signing-payload
npm run base:agent-proposal-execution-signing-payload-preflight
npm run base:agent-proposal-execution-signing-payload-verify
```

## proposalReview

Entry points: `runtime/cli/proposalReview/`.

```text
npm run base:agent-proposal-review-approval
npm run base:agent-proposal-review-approval-verify
npm run base:agent-proposal-review-manifest
npm run base:agent-proposal-review-manifest-verify
npm run base:agent-proposal-review-package
npm run base:agent-proposal-review-preflight
```

Approval records are local review acknowledgements. The approval verification
command reports `verificationScope: "local-record-consistency"` and
`reviewerAuthentication: "not-verified"` on both passing and failing checks.
`passed: true` means the record passed the existing structure, evidence-hash,
and preflight-consistency checks. It does not prove that the supplied reviewer
controls the address, authorized the decision, or signed the record.

When the approval command uses `--output`, its console write summary includes
`recordType: "local-review-acknowledgement"` and
`reviewerAuthentication: "not-verified"`. The saved approval artifact is unchanged;
without `--output`, stdout remains the same raw approval artifact for piping.
Existing exit codes, review checks, and execution controls remain unchanged.
These labels describe evidence scope and do not add authentication or authority.

## release

Entry points: `runtime/cli/release/`.

```text
npm run base:release-automation
npm run base:release-index
npm run base:release-note
npm run base:release-note-verify
npm run base:release-status
npm run base:release-status-verify
npm run base:release-summary
```

## reputation

Entry points: `runtime/cli/reputation/`.

```text
npm run base:reputation
npm run base:reputation-history
npm run base:reputation-history-safety-check
npm run base:reputation-safety-check
npm run base:reputation-score-sync
npm run base:reputation-score-sync-safety-check
```

## sdk

Entry points: `runtime/cli/sdk/`.

```text
npm run base:agent-sdk-examples
npm run base:agent-sdk-examples-verify
npm run base:agent-sdk-serve
```

## security

Entry points: `runtime/cli/security/`.

```text
npm run base:security-evidence
```

## tokens

Entry points: `runtime/cli/tokens/`.

```text
npm run base:swap
npm run base:swap-safety-check
npm run base:token-safety-check
npm run base:token-transfer
```
