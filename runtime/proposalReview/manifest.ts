import { createHash } from "node:crypto";

import { verifyAgentProposalReviewPreflight } from "./preflight.js";

import type { AgentProposalReviewPreflightReport } from "./preflight.js";

export interface CreateAgentProposalReviewManifestParams {
  proposalPath: string;
  proposalJson: string;
  summaryPath: string;
  summaryMarkdown: string;
  generatedAt?: string | undefined;
}

export interface AgentProposalReviewManifest {
  schemaVersion: 1;
  generatedAt: string;
  proposal: AgentProposalReviewManifestFile;
  summary: AgentProposalReviewManifestFile;
  preflight: AgentProposalReviewPreflightReport;
}

export interface AgentProposalReviewManifestFile {
  path: string;
  sha256: string;
}

export function createAgentProposalReviewManifest(
  params: CreateAgentProposalReviewManifestParams,
): AgentProposalReviewManifest {
  return {
    schemaVersion: 1,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    proposal: {
      path: params.proposalPath,
      sha256: sha256(params.proposalJson),
    },
    summary: {
      path: params.summaryPath,
      sha256: sha256(params.summaryMarkdown),
    },
    preflight: verifyAgentProposalReviewPreflight(params),
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
