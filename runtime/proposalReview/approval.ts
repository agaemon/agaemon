import { createHash } from "node:crypto";

import { getAddress } from "viem";

import { verifyAgentProposalReviewManifest } from "./manifestVerify.js";

import type { Address } from "viem";
import type { AgentProposalReviewManifest, AgentProposalReviewManifestFile } from "./manifest.js";
import type { AgentProposalReviewManifestVerification } from "./manifestVerify.js";
import type { AgentProposalReviewPreflightReport } from "./preflight.js";

export type AgentProposalReviewDecision = "approved" | "rejected";

export interface CreateAgentProposalReviewApprovalParams {
  manifestPath: string;
  manifestJson: string;
  proposalPath: string;
  proposalJson: string;
  summaryPath: string;
  summaryMarkdown: string;
  reviewer: string;
  decision: string;
  generatedAt?: string | undefined;
}

export interface AgentProposalReviewApproval {
  schemaVersion: 1;
  generatedAt: string;
  reviewer: Address;
  decision: AgentProposalReviewDecision;
  manifest: AgentProposalReviewManifestFile;
  proposal: AgentProposalReviewManifestFile;
  summary: AgentProposalReviewManifestFile;
  preflight: AgentProposalReviewPreflightReport;
}

export interface AgentProposalReviewApprovalResult {
  passed: boolean;
  failures: string[];
  manifestVerification: AgentProposalReviewManifestVerification;
  approval: AgentProposalReviewApproval | null;
}

export function createAgentProposalReviewApproval(
  params: CreateAgentProposalReviewApprovalParams,
): AgentProposalReviewApprovalResult {
  const manifestVerification = verifyAgentProposalReviewManifest(params);
  const failures = [...manifestVerification.failures];
  const manifest = parseManifest(params.manifestJson);
  const reviewer = normalizeReviewer(params.reviewer, failures);
  const decision = normalizeDecision(params.decision, failures);

  if (manifestVerification.passed && manifest !== null && decision === "approved") {
    if (manifest.preflight.executable !== true) failures.push("approved review packages must be executable");
    if (manifest.preflight.transactions < 1) {
      failures.push("approved review packages must include at least one transaction");
    }
  }

  if (failures.length > 0 || !manifestVerification.passed || manifest === null || reviewer === null || decision === null) {
    return {
      passed: false,
      failures,
      manifestVerification,
      approval: null,
    };
  }

  return {
    passed: true,
    failures: [],
    manifestVerification,
    approval: {
      schemaVersion: 1,
      generatedAt: params.generatedAt ?? new Date().toISOString(),
      reviewer,
      decision,
      manifest: {
        path: params.manifestPath,
        sha256: sha256(params.manifestJson),
      },
      proposal: manifest.proposal,
      summary: manifest.summary,
      preflight: manifest.preflight,
    },
  };
}

function parseManifest(manifestJson: string): AgentProposalReviewManifest | null {
  try {
    const value = JSON.parse(manifestJson);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? value as AgentProposalReviewManifest
      : null;
  } catch {
    return null;
  }
}

function normalizeReviewer(value: string, failures: string[]): Address | null {
  try {
    return getAddress(value);
  } catch {
    failures.push("reviewer must be a valid EVM address");
    return null;
  }
}

function normalizeDecision(value: string, failures: string[]): AgentProposalReviewDecision | null {
  if (value === "approved" || value === "rejected") return value;
  failures.push("decision must be approved or rejected");
  return null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
