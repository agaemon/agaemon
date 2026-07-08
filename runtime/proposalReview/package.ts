import { createAgentProposalSummary } from "../proposal/summary.js";
import { createAgentProposalReviewManifest } from "./manifest.js";
import { verifyAgentProposalReviewManifest } from "./manifestVerify.js";
import { verifyAgentProposalReviewPreflight } from "./preflight.js";

import type { AgentProposalReviewManifest } from "./manifest.js";
import type { AgentProposalReviewManifestVerification } from "./manifestVerify.js";

export interface CreateAgentProposalReviewPackageParams {
  proposalPath: string;
  proposalJson: string;
  summaryPath: string;
  summaryMarkdown?: string | undefined;
  manifestPath: string;
  generatedAt?: string | undefined;
}

export interface AgentProposalReviewPackage {
  passed: boolean;
  failures: string[];
  proposal: string;
  summary: {
    path: string;
    markdown: string;
  };
  manifestPath: string;
  manifest: AgentProposalReviewManifest | null;
  manifestVerification: AgentProposalReviewManifestVerification | null;
}

export function createAgentProposalReviewPackage(
  params: CreateAgentProposalReviewPackageParams,
): AgentProposalReviewPackage {
  const summary = createAgentProposalSummary({
    proposalPath: params.proposalPath,
    proposalJson: params.proposalJson,
  });

  if (!summary.passed) {
    return {
      passed: false,
      failures: summary.failures,
      proposal: params.proposalPath,
      summary: { path: params.summaryPath, markdown: "" },
      manifestPath: params.manifestPath,
      manifest: null,
      manifestVerification: null,
    };
  }

  const summaryMarkdown = params.summaryMarkdown ?? summary.markdown;
  const preflight = verifyAgentProposalReviewPreflight({
    proposalPath: params.proposalPath,
    proposalJson: params.proposalJson,
    summaryPath: params.summaryPath,
    summaryMarkdown,
  });

  if (!preflight.passed) {
    return {
      passed: false,
      failures: preflight.checks.flatMap((check) => check.failures),
      proposal: params.proposalPath,
      summary: { path: params.summaryPath, markdown: summaryMarkdown },
      manifestPath: params.manifestPath,
      manifest: null,
      manifestVerification: null,
    };
  }

  const manifest = createAgentProposalReviewManifest({
    proposalPath: params.proposalPath,
    proposalJson: params.proposalJson,
    summaryPath: params.summaryPath,
    summaryMarkdown,
    generatedAt: params.generatedAt,
  });
  const manifestVerification = verifyAgentProposalReviewManifest({
    manifestJson: JSON.stringify(manifest, null, 2),
    proposalPath: params.proposalPath,
    proposalJson: params.proposalJson,
    summaryPath: params.summaryPath,
    summaryMarkdown,
  });

  return {
    passed: manifestVerification.passed,
    failures: manifestVerification.failures,
    proposal: params.proposalPath,
    summary: { path: params.summaryPath, markdown: summaryMarkdown },
    manifestPath: params.manifestPath,
    manifest,
    manifestVerification,
  };
}
