import { createAgentProposalExecutionManifest } from "./manifest.js";
import { verifyAgentProposalExecutionManifest } from "./manifestVerify.js";
import { createAgentProposalExecutionPackage } from "./package.js";

import type {
  AgentProposalExecutionManifestVerification,
} from "./manifestVerify.js";
import type {
  AgentProposalExecutionPackage,
  CreateAgentProposalExecutionPackageParams,
} from "./package.js";

export interface CreateAgentProposalExecutionHandoffParams extends CreateAgentProposalExecutionPackageParams {
  executionManifestPath: string;
}

export interface AgentProposalExecutionHandoff {
  passed: boolean;
  failures: string[];
  preview: {
    path: string;
    json: string;
  };
  runbook: {
    path: string;
    markdown: string;
  };
  executionManifest: {
    path: string;
    json: string;
  };
  executionPackage: AgentProposalExecutionPackage;
  executionManifestVerification: AgentProposalExecutionManifestVerification | null;
}

export function createAgentProposalExecutionHandoff(
  params: CreateAgentProposalExecutionHandoffParams,
): AgentProposalExecutionHandoff {
  const executionPackage = createAgentProposalExecutionPackage(params);
  if (!executionPackage.passed) {
    return {
      passed: false,
      failures: executionPackage.failures,
      preview: executionPackage.preview,
      runbook: executionPackage.runbook,
      executionManifest: { path: params.executionManifestPath, json: "" },
      executionPackage,
      executionManifestVerification: null,
    };
  }

  const manifest = createAgentProposalExecutionManifest({
    ...params,
    previewJson: executionPackage.preview.json,
    runbookMarkdown: executionPackage.runbook.markdown,
    executionManifestPath: params.executionManifestPath,
  });
  const executionManifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
  const executionManifestVerification = verifyAgentProposalExecutionManifest({
    ...params,
    executionManifestJson,
    previewJson: executionPackage.preview.json,
    runbookMarkdown: executionPackage.runbook.markdown,
  });

  return {
    passed: executionManifestVerification.passed,
    failures: executionManifestVerification.failures,
    preview: executionPackage.preview,
    runbook: executionPackage.runbook,
    executionManifest: { path: params.executionManifestPath, json: executionManifestJson },
    executionPackage,
    executionManifestVerification,
  };
}
