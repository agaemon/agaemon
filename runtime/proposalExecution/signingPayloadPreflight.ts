import { verifyAgentProposalExecutionSigningPayload } from "./signingPayloadVerify.js";

import type { VerifyAgentProposalExecutionSigningPayloadParams } from "./signingPayloadVerify.js";

export interface VerifyAgentProposalExecutionSigningPayloadPreflightParams extends VerifyAgentProposalExecutionSigningPayloadParams {
  payloadPath: string;
  executionManifestPath: string;
}

export interface AgentProposalExecutionSigningPayloadPreflightCheck {
  name: "execution-readiness" | "signing-payload";
  passed: boolean;
  failures: string[];
}

export interface AgentProposalExecutionSigningPayloadPreflightReport {
  passed: boolean;
  payload: string;
  readiness: string;
  preview: string;
  runbook: string;
  executionManifest: string;
  bundle: string;
  approval: string;
  manifest: string;
  proposal: string;
  summary: string;
  signer: string | null;
  chainId: number | null;
  nonceStart: number | null;
  transactions: number;
  checks: AgentProposalExecutionSigningPayloadPreflightCheck[];
}

export function verifyAgentProposalExecutionSigningPayloadPreflight(
  params: VerifyAgentProposalExecutionSigningPayloadPreflightParams,
): AgentProposalExecutionSigningPayloadPreflightReport {
  const verification = verifyAgentProposalExecutionSigningPayload(params);
  const payload = verification.result.payload;
  const readinessVerification = verification.result.verification;
  const checks: AgentProposalExecutionSigningPayloadPreflightCheck[] = [
    {
      name: "execution-readiness",
      passed: readinessVerification.passed,
      failures: readinessVerification.failures,
    },
    {
      name: "signing-payload",
      passed: verification.passed,
      failures: verification.failures,
    },
  ];

  return {
    passed: checks.every((check) => check.passed),
    payload: params.payloadPath,
    readiness: params.readinessPath,
    preview: params.previewPath,
    runbook: params.runbookPath,
    executionManifest: params.executionManifestPath,
    bundle: params.bundlePath,
    approval: params.approvalPath,
    manifest: params.manifestPath,
    proposal: params.proposalPath,
    summary: params.summaryPath,
    signer: payload?.signer ?? null,
    chainId: payload?.chainId ?? null,
    nonceStart: payload?.nonceStart ?? null,
    transactions: payload?.transactions.length ?? 0,
    checks,
  };
}
