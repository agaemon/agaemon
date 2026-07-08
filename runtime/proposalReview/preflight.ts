import { verifyAgentProposalSummary } from "../proposal/summaryVerify.js";
import { verifyAgentProposalArtifact } from "../proposal/verify.js";

export interface VerifyAgentProposalReviewPreflightParams {
  proposalPath: string;
  proposalJson: string;
  summaryPath: string;
  summaryMarkdown: string;
}

export interface AgentProposalReviewPreflightCheck {
  name: "proposal-artifact" | "proposal-summary";
  passed: boolean;
  failures: string[];
}

export interface AgentProposalReviewPreflightReport {
  passed: boolean;
  proposal: string;
  summary: string;
  source: "plan" | "intent" | null;
  sourcePath: string | null;
  chainId: number | null;
  executable: boolean | null;
  steps: number;
  transactions: number;
  checks: AgentProposalReviewPreflightCheck[];
}

export function verifyAgentProposalReviewPreflight(
  params: VerifyAgentProposalReviewPreflightParams,
): AgentProposalReviewPreflightReport {
  const artifact = verifyAgentProposalArtifact(params.proposalJson);
  const artifactCheck: AgentProposalReviewPreflightCheck = {
    name: "proposal-artifact",
    passed: artifact.passed,
    failures: artifact.failures,
  };
  const summaryCheck = artifact.passed
    ? createSummaryCheck(params)
    : {
        name: "proposal-summary" as const,
        passed: false,
        failures: ["proposal artifact is invalid"],
      };
  const checks = [artifactCheck, summaryCheck];

  return {
    passed: checks.every((check) => check.passed),
    proposal: params.proposalPath,
    summary: params.summaryPath,
    source: artifact.source,
    sourcePath: artifact.sourcePath,
    chainId: artifact.chainId,
    executable: artifact.executable,
    steps: artifact.steps,
    transactions: artifact.transactions,
    checks,
  };
}

function createSummaryCheck(params: VerifyAgentProposalReviewPreflightParams): AgentProposalReviewPreflightCheck {
  const summary = verifyAgentProposalSummary({
    proposalPath: params.proposalPath,
    proposalJson: params.proposalJson,
    summaryMarkdown: params.summaryMarkdown,
  });
  return {
    name: "proposal-summary",
    passed: summary.passed,
    failures: summary.failures,
  };
}
