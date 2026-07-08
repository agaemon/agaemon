import { createHash } from "node:crypto";

import { verifyAgentProposalReviewApproval } from "../proposalReview/approvalVerify.js";

import type { AgentProposalReviewApprovalVerification } from "../proposalReview/approvalVerify.js";

export interface CreateAgentProposalExecutionBundleParams {
  approvalPath: string;
  approvalJson: string;
  manifestPath: string;
  manifestJson: string;
  proposalPath: string;
  proposalJson: string;
  summaryPath: string;
  summaryMarkdown: string;
  generatedAt?: string | undefined;
}

export interface AgentProposalExecutionBundleResult {
  passed: boolean;
  failures: string[];
  approvalVerification: AgentProposalReviewApprovalVerification;
  bundle: AgentProposalExecutionBundle | null;
}

export interface AgentProposalExecutionBundle {
  schemaVersion: 1;
  generatedAt: string;
  chainId: number;
  objective: string;
  agent: string;
  approval: EvidenceFile;
  manifest: EvidenceFile;
  proposal: EvidenceFile;
  summary: EvidenceFile;
  transactions: AgentProposalExecutionBundleTransaction[];
}

export interface EvidenceFile {
  path: string;
  sha256: string;
}

export interface AgentProposalExecutionBundleTransaction {
  stepId: string;
  title: string;
  to: string;
  value: string;
  data: string;
}

interface ApprovalArtifact {
  decision: string;
}

interface ProposalArtifact {
  chainId: number;
  objective: string;
  agent: string;
  executable: boolean;
  steps: ProposalStep[];
}

interface ProposalStep {
  id: string;
  title: string;
  transaction: ProposalTransaction | null;
}

interface ProposalTransaction {
  to: string;
  value: string;
  data: string;
}

export function createAgentProposalExecutionBundle(
  params: CreateAgentProposalExecutionBundleParams,
): AgentProposalExecutionBundleResult {
  const approvalVerification = verifyAgentProposalReviewApproval(params);
  const failures = [...approvalVerification.failures];

  let approval: ApprovalArtifact | null = null;
  let proposal: ProposalArtifact | null = null;
  if (approvalVerification.passed) {
    approval = JSON.parse(params.approvalJson) as ApprovalArtifact;
    proposal = JSON.parse(params.proposalJson) as ProposalArtifact;
    if (approval.decision !== "approved") failures.push("execution bundles require an approved review decision");
    if (proposal.executable !== true) failures.push("execution bundles require executable proposal evidence");
  }

  const transactions = proposal === null ? [] : extractTransactions(proposal);
  if (approvalVerification.passed && transactions.length === 0) {
    failures.push("execution bundles require at least one transaction");
  }

  if (!approvalVerification.passed || failures.length > 0 || proposal === null) {
    return {
      passed: false,
      failures,
      approvalVerification,
      bundle: null,
    };
  }

  return {
    passed: true,
    failures: [],
    approvalVerification,
    bundle: {
      schemaVersion: 1,
      generatedAt: params.generatedAt ?? new Date().toISOString(),
      chainId: proposal.chainId,
      objective: proposal.objective,
      agent: proposal.agent,
      approval: { path: params.approvalPath, sha256: sha256(params.approvalJson) },
      manifest: { path: params.manifestPath, sha256: sha256(params.manifestJson) },
      proposal: { path: params.proposalPath, sha256: sha256(params.proposalJson) },
      summary: { path: params.summaryPath, sha256: sha256(params.summaryMarkdown) },
      transactions,
    },
  };
}

function extractTransactions(proposal: ProposalArtifact): AgentProposalExecutionBundleTransaction[] {
  return proposal.steps.flatMap((step) => {
    if (step.transaction === null) return [];
    return [{
      stepId: step.id,
      title: step.title,
      to: step.transaction.to,
      value: step.transaction.value,
      data: step.transaction.data,
    }];
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
