import { isDeepStrictEqual } from "node:util";

import { createAgentProposalExecutionBundle } from "./bundle.js";

import type { AgentProposalReviewApprovalVerification } from "../proposalReview/approvalVerify.js";

export interface VerifyAgentProposalExecutionBundleParams {
  bundleJson: string;
  approvalPath: string;
  approvalJson: string;
  manifestPath: string;
  manifestJson: string;
  proposalPath: string;
  proposalJson: string;
  summaryPath: string;
  summaryMarkdown: string;
}

export interface AgentProposalExecutionBundleVerification {
  passed: boolean;
  failures: string[];
  approvalVerification: AgentProposalReviewApprovalVerification;
}

export function verifyAgentProposalExecutionBundle(
  params: VerifyAgentProposalExecutionBundleParams,
): AgentProposalExecutionBundleVerification {
  const expected = createAgentProposalExecutionBundle(params);
  let bundle: unknown;
  try {
    bundle = JSON.parse(params.bundleJson);
  } catch (error) {
    return {
      passed: false,
      failures: [`bundle JSON is malformed: ${error instanceof Error ? error.message : String(error)}`],
      approvalVerification: expected.approvalVerification,
    };
  }

  if (!isRecord(bundle)) {
    return {
      passed: false,
      failures: ["bundle must be a JSON object"],
      approvalVerification: expected.approvalVerification,
    };
  }

  const failures = [...expected.failures];
  if (bundle.schemaVersion !== 1) failures.push("bundle schemaVersion must be 1");
  if (typeof bundle.generatedAt !== "string" || Number.isNaN(Date.parse(bundle.generatedAt))) {
    failures.push("bundle generatedAt must be a valid timestamp");
  }

  if (expected.bundle !== null) {
    if (bundle.chainId !== expected.bundle.chainId) failures.push("bundle chainId does not match current approved proposal");
    if (bundle.objective !== expected.bundle.objective) {
      failures.push("bundle objective does not match current approved proposal");
    }
    if (bundle.agent !== expected.bundle.agent) failures.push("bundle agent does not match current approved proposal");
    verifyEvidence(bundle.approval, expected.bundle.approval, "approval", failures);
    verifyEvidence(bundle.manifest, expected.bundle.manifest, "manifest", failures);
    verifyEvidence(bundle.proposal, expected.bundle.proposal, "proposal", failures);
    verifyEvidence(bundle.summary, expected.bundle.summary, "summary", failures);
    if (!isDeepStrictEqual(bundle.transactions, expected.bundle.transactions)) {
      failures.push("bundle transactions do not match current approved proposal");
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    approvalVerification: expected.approvalVerification,
  };
}

function verifyEvidence(
  actual: unknown,
  expected: { path: string; sha256: string },
  name: "approval" | "manifest" | "proposal" | "summary",
  failures: string[],
): void {
  if (!isRecord(actual)) {
    failures.push(`bundle ${name} must be an object`);
    return;
  }
  if (actual.path !== expected.path) failures.push(`bundle ${name} path does not match ${name} argument`);
  if (actual.sha256 !== expected.sha256) failures.push(`bundle ${name} sha256 does not match current ${name}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
