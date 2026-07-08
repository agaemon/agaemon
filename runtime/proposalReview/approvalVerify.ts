import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { getAddress } from "viem";

import { verifyAgentProposalReviewManifest } from "./manifestVerify.js";

import type { AgentProposalReviewManifest } from "./manifest.js";
import type { AgentProposalReviewManifestVerification } from "./manifestVerify.js";
import type { AgentProposalReviewDecision } from "./approval.js";

export interface VerifyAgentProposalReviewApprovalParams {
  approvalJson: string;
  manifestPath: string;
  manifestJson: string;
  proposalPath: string;
  proposalJson: string;
  summaryPath: string;
  summaryMarkdown: string;
}

export interface AgentProposalReviewApprovalVerification {
  passed: boolean;
  failures: string[];
  manifestVerification: AgentProposalReviewManifestVerification;
}

export function verifyAgentProposalReviewApproval(
  params: VerifyAgentProposalReviewApprovalParams,
): AgentProposalReviewApprovalVerification {
  const manifestVerification = verifyAgentProposalReviewManifest(params);
  let approval: unknown;
  try {
    approval = JSON.parse(params.approvalJson);
  } catch (error) {
    return {
      passed: false,
      failures: [`approval JSON is malformed: ${error instanceof Error ? error.message : String(error)}`],
      manifestVerification,
    };
  }

  if (!isRecord(approval)) {
    return { passed: false, failures: ["approval must be a JSON object"], manifestVerification };
  }

  const failures = [...manifestVerification.failures];
  const manifest = parseManifest(params.manifestJson);
  if (approval.schemaVersion !== 1) failures.push("approval schemaVersion must be 1");
  if (typeof approval.generatedAt !== "string" || Number.isNaN(Date.parse(approval.generatedAt))) {
    failures.push("approval generatedAt must be a valid timestamp");
  }
  verifyReviewer(approval.reviewer, failures);
  const decision = verifyDecision(approval.decision, failures);
  verifyEvidenceFile(approval.manifest, "manifest", params.manifestPath, params.manifestJson, failures);

  if (manifestVerification.passed && manifest !== null) {
    if (!isDeepStrictEqual(approval.proposal, manifest.proposal)) {
      failures.push("approval proposal evidence does not match current manifest");
    }
    if (!isDeepStrictEqual(approval.summary, manifest.summary)) {
      failures.push("approval summary evidence does not match current manifest");
    }
    if (!isDeepStrictEqual(approval.preflight, manifest.preflight)) {
      failures.push("approval preflight does not match current manifest");
    }
    if (decision === "approved") {
      if (manifest.preflight.executable !== true) failures.push("approved approval artifacts must be executable");
      if (manifest.preflight.transactions < 1) {
        failures.push("approved approval artifacts must include at least one transaction");
      }
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    manifestVerification,
  };
}

function verifyEvidenceFile(
  value: unknown,
  name: "manifest",
  expectedPath: string,
  contents: string,
  failures: string[],
): void {
  if (!isRecord(value)) {
    failures.push(`${name} must be an object`);
    return;
  }

  if (value.path !== expectedPath) failures.push(`${name} path does not match ${name} argument`);
  if (!isSha256(value.sha256)) {
    failures.push(`${name} sha256 must be a SHA-256 hex string`);
    return;
  }

  if (value.sha256 !== sha256(contents)) failures.push(`approval ${name} sha256 does not match current ${name}`);
}

function parseManifest(manifestJson: string): AgentProposalReviewManifest | null {
  try {
    const value = JSON.parse(manifestJson);
    return isRecord(value) ? value as unknown as AgentProposalReviewManifest : null;
  } catch {
    return null;
  }
}

function verifyReviewer(value: unknown, failures: string[]): void {
  if (typeof value !== "string") {
    failures.push("approval reviewer must be a valid EVM address");
    return;
  }
  try {
    getAddress(value);
  } catch {
    failures.push("approval reviewer must be a valid EVM address");
  }
}

function verifyDecision(value: unknown, failures: string[]): AgentProposalReviewDecision | null {
  if (value === "approved" || value === "rejected") return value;
  failures.push("approval decision must be approved or rejected");
  return null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
}
