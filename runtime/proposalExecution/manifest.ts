import { createHash } from "node:crypto";

import { verifyAgentProposalExecutionPreflight } from "./preflight.js";

import type { AgentProposalExecutionPreflightReport } from "./preflight.js";
import type { VerifyAgentProposalExecutionPreflightParams } from "./preflight.js";

export interface CreateAgentProposalExecutionManifestParams
  extends VerifyAgentProposalExecutionPreflightParams {
  executionManifestPath?: string | undefined;
  generatedAt?: string | undefined;
}

export interface AgentProposalExecutionManifest {
  schemaVersion: 1;
  generatedAt: string;
  preview: AgentProposalExecutionManifestFile;
  runbook: AgentProposalExecutionManifestFile;
  bundle: AgentProposalExecutionManifestFile;
  approval: AgentProposalExecutionManifestFile;
  reviewManifest: AgentProposalExecutionManifestFile;
  proposal: AgentProposalExecutionManifestFile;
  summary: AgentProposalExecutionManifestFile;
  preflight: AgentProposalExecutionPreflightReport;
}

export interface AgentProposalExecutionManifestFile {
  path: string;
  sha256: string;
}

export function createAgentProposalExecutionManifest(
  params: CreateAgentProposalExecutionManifestParams,
): AgentProposalExecutionManifest {
  return {
    schemaVersion: 1,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    preview: { path: params.previewPath, sha256: sha256(params.previewJson) },
    runbook: { path: params.runbookPath, sha256: sha256(params.runbookMarkdown) },
    bundle: { path: params.bundlePath, sha256: sha256(params.bundleJson) },
    approval: { path: params.approvalPath, sha256: sha256(params.approvalJson) },
    reviewManifest: { path: params.manifestPath, sha256: sha256(params.manifestJson) },
    proposal: { path: params.proposalPath, sha256: sha256(params.proposalJson) },
    summary: { path: params.summaryPath, sha256: sha256(params.summaryMarkdown) },
    preflight: verifyAgentProposalExecutionPreflight(params),
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
