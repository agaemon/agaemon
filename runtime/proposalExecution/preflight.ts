import { verifyAgentProposalExecutionPackage } from "./packageVerify.js";

import type { VerifyAgentProposalExecutionPackageParams } from "./packageVerify.js";

export interface VerifyAgentProposalExecutionPreflightParams extends VerifyAgentProposalExecutionPackageParams {}

export interface AgentProposalExecutionPreflightCheck {
  name: "execution-preview" | "execution-runbook" | "execution-package";
  passed: boolean;
  failures: string[];
}

export interface AgentProposalExecutionPreflightReport {
  passed: boolean;
  preview: string;
  runbook: string;
  bundle: string;
  approval: string;
  manifest: string;
  proposal: string;
  summary: string;
  chainId: number | null;
  agent: string | null;
  objective: string | null;
  transactions: number;
  checks: AgentProposalExecutionPreflightCheck[];
}

export function verifyAgentProposalExecutionPreflight(
  params: VerifyAgentProposalExecutionPreflightParams,
): AgentProposalExecutionPreflightReport {
  const verification = verifyAgentProposalExecutionPackage(params);
  const preview = verification.previewVerification.previewResult.preview;
  const checks: AgentProposalExecutionPreflightCheck[] = [
    {
      name: "execution-preview",
      passed: verification.previewVerification.passed,
      failures: verification.previewVerification.failures,
    },
    {
      name: "execution-runbook",
      passed: verification.runbookVerification.passed,
      failures: verification.runbookVerification.failures,
    },
    {
      name: "execution-package",
      passed: verification.passed,
      failures: verification.failures,
    },
  ];

  return {
    passed: checks.every((check) => check.passed),
    preview: params.previewPath,
    runbook: params.runbookPath,
    bundle: params.bundlePath,
    approval: params.approvalPath,
    manifest: params.manifestPath,
    proposal: params.proposalPath,
    summary: params.summaryPath,
    chainId: preview?.chainId ?? null,
    agent: preview?.agent ?? null,
    objective: preview?.objective ?? null,
    transactions: preview?.transactions.length ?? 0,
    checks,
  };
}
