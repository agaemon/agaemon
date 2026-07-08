import { verifyAgentProposalExecutionHandoff } from "../proposalExecution/handoffVerify.js";
import { verifyAgentProposalReviewApproval } from "../proposalReview/approvalVerify.js";

import type {
  AgentProposalExecutionHandoffVerification,
} from "../proposalExecution/handoffVerify.js";
import type {
  AgentProposalReviewApprovalVerification,
} from "../proposalReview/approvalVerify.js";
import type {
  AgentProposalReviewDecision,
} from "../proposalReview/approval.js";
import type {
  AgentOsLocalWorkflowPackage,
} from "./localWorkflow.js";

export interface VerifyAgentOsLocalWorkflowPackageParams {
  workflow: AgentOsLocalWorkflowPackage;
  proposalPath: string;
  proposalJson: string;
}

export type AgentOsLocalWorkflowVerificationCheckName =
  | "workflow-result"
  | "review-approval"
  | "execution-handoff"
  | "trust-boundary";

export interface AgentOsLocalWorkflowVerificationCheck {
  name: AgentOsLocalWorkflowVerificationCheckName;
  passed: boolean;
  failures: string[];
}

export interface AgentOsLocalWorkflowTrustBoundary {
  ai: "proposes";
  policy: "decides";
  accounts: "execute";
  callClass: "local-only";
  mainnet: false;
  liveFunds: false;
}

export interface AgentOsLocalWorkflowPackageVerification {
  passed: boolean;
  failures: string[];
  checks: AgentOsLocalWorkflowVerificationCheck[];
  trustBoundary: AgentOsLocalWorkflowTrustBoundary;
  reviewApprovalVerification: AgentProposalReviewApprovalVerification;
  executionHandoffVerification: AgentProposalExecutionHandoffVerification | null;
}

export function verifyAgentOsLocalWorkflowPackage(
  params: VerifyAgentOsLocalWorkflowPackageParams,
): AgentOsLocalWorkflowPackageVerification {
  const workflowResultFailures = params.workflow.passed
    ? []
    : ["SDK workflow package did not pass", ...params.workflow.failures];
  const workflowResultCheck = createCheck("workflow-result", workflowResultFailures);

  const reviewApprovalVerification = verifyAgentProposalReviewApproval({
    approvalJson: params.workflow.files.approval.json,
    manifestPath: params.workflow.files.reviewManifest.path,
    manifestJson: params.workflow.files.reviewManifest.json,
    proposalPath: params.proposalPath,
    proposalJson: params.proposalJson,
    summaryPath: params.workflow.files.summary.path,
    summaryMarkdown: params.workflow.files.summary.markdown,
  });
  const reviewApprovalCheck = createCheck("review-approval", reviewApprovalVerification.failures);

  const decision = readApprovalDecision(params.workflow.files.approval.json);
  const shouldVerifyExecution = decision === "approved" || hasExecutionEvidence(params.workflow);
  const executionHandoffVerification = shouldVerifyExecution
    ? verifyAgentProposalExecutionHandoff({
      proposalPath: params.proposalPath,
      proposalJson: params.proposalJson,
      summaryPath: params.workflow.files.summary.path,
      summaryMarkdown: params.workflow.files.summary.markdown,
      manifestPath: params.workflow.files.reviewManifest.path,
      manifestJson: params.workflow.files.reviewManifest.json,
      approvalPath: params.workflow.files.approval.path,
      approvalJson: params.workflow.files.approval.json,
      bundlePath: params.workflow.files.executionBundle.path,
      bundleJson: params.workflow.files.executionBundle.json,
      previewPath: params.workflow.files.executionPreview.path,
      previewJson: params.workflow.files.executionPreview.json,
      runbookPath: params.workflow.files.executionRunbook.path,
      runbookMarkdown: params.workflow.files.executionRunbook.markdown,
      executionManifestJson: params.workflow.files.executionManifest.json,
    })
    : null;
  const executionHandoffCheck = executionHandoffVerification === null
    ? null
    : createCheck("execution-handoff", executionHandoffVerification.failures);

  const trustBoundaryCheck = createCheck("trust-boundary", verifyTrustBoundary({
    workflow: params.workflow,
    decision,
    reviewApprovalVerification,
    executionHandoffVerification,
  }));

  const checks = [
    workflowResultCheck,
    reviewApprovalCheck,
    ...(executionHandoffCheck === null ? [] : [executionHandoffCheck]),
    trustBoundaryCheck,
  ];

  return {
    passed: checks.every((check) => check.passed),
    failures: uniqueFailures(checks.flatMap((check) => check.failures)),
    checks,
    trustBoundary: createTrustBoundary(),
    reviewApprovalVerification,
    executionHandoffVerification,
  };
}

function createTrustBoundary(): AgentOsLocalWorkflowTrustBoundary {
  return {
    ai: "proposes",
    policy: "decides",
    accounts: "execute",
    callClass: "local-only",
    mainnet: false,
    liveFunds: false,
  };
}

interface VerifyTrustBoundaryParams {
  workflow: AgentOsLocalWorkflowPackage;
  decision: AgentProposalReviewDecision | null;
  reviewApprovalVerification: AgentProposalReviewApprovalVerification;
  executionHandoffVerification: AgentProposalExecutionHandoffVerification | null;
}

function verifyTrustBoundary(params: VerifyTrustBoundaryParams): string[] {
  const failures: string[] = [];
  if (!params.workflow.passed) failures.push("SDK workflow package did not pass");
  if (!params.reviewApprovalVerification.passed) failures.push("policy review evidence did not verify");

  if (params.decision === "approved" && params.executionHandoffVerification === null) {
    failures.push("approved SDK workflows must include execution handoff evidence");
  }
  if (params.decision === "approved" && params.executionHandoffVerification?.passed === false) {
    failures.push("approved SDK workflow execution evidence did not verify");
  }
  if (params.decision === "rejected" && hasExecutionEvidence(params.workflow)) {
    failures.push("rejected SDK workflows must not include execution handoff evidence");
  }

  return failures;
}

function createCheck(
  name: AgentOsLocalWorkflowVerificationCheckName,
  failures: string[],
): AgentOsLocalWorkflowVerificationCheck {
  return {
    name,
    passed: failures.length === 0,
    failures: uniqueFailures(failures),
  };
}

function readApprovalDecision(approvalJson: string): AgentProposalReviewDecision | null {
  try {
    const approval = JSON.parse(approvalJson);
    if (isRecord(approval) && (approval.decision === "approved" || approval.decision === "rejected")) {
      return approval.decision;
    }
  } catch {
    return null;
  }
  return null;
}

function hasExecutionEvidence(workflow: AgentOsLocalWorkflowPackage): boolean {
  return workflow.executionBundle !== null
    || workflow.executionHandoff !== null
    || workflow.files.executionBundle.json.length > 0
    || workflow.files.executionPreview.json.length > 0
    || workflow.files.executionRunbook.markdown.length > 0
    || workflow.files.executionManifest.json.length > 0;
}

function uniqueFailures(failures: string[]): string[] {
  return [...new Set(failures)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
