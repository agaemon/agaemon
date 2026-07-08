import { createAgentProposalExecutionPreview } from "./preview.js";
import { verifyAgentProposalExecutionPreview } from "./previewVerify.js";
import { createAgentProposalExecutionRunbook } from "./runbook.js";
import { verifyAgentProposalExecutionRunbook } from "./runbookVerify.js";

import type { CreateAgentProposalExecutionPreviewParams } from "./preview.js";
import type {
  AgentProposalExecutionPreviewVerification,
} from "./previewVerify.js";
import type { AgentProposalExecutionRunbookVerification } from "./runbookVerify.js";

export interface CreateAgentProposalExecutionPackageParams extends CreateAgentProposalExecutionPreviewParams {
  previewPath: string;
  runbookPath: string;
  generatedAt?: string | undefined;
}

export interface AgentProposalExecutionPackage {
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
  previewVerification: AgentProposalExecutionPreviewVerification;
  runbookVerification: AgentProposalExecutionRunbookVerification | null;
}

export function createAgentProposalExecutionPackage(
  params: CreateAgentProposalExecutionPackageParams,
): AgentProposalExecutionPackage {
  const preview = createAgentProposalExecutionPreview(params);
  if (!preview.passed || preview.preview === null) {
    const previewVerification = {
      passed: false,
      failures: preview.failures,
      previewResult: preview,
    };
    return {
      passed: false,
      failures: preview.failures.length > 0 ? preview.failures : previewVerification.failures,
      preview: { path: params.previewPath, json: "" },
      runbook: { path: params.runbookPath, markdown: "" },
      previewVerification,
      runbookVerification: null,
    };
  }

  const previewJson = `${JSON.stringify(preview.preview, null, 2)}\n`;
  const runbook = createAgentProposalExecutionRunbook({
    ...params,
    previewPath: params.previewPath,
    previewJson,
  });
  const previewVerification = verifyAgentProposalExecutionPreview({
    ...params,
    previewJson,
  });
  const runbookVerification = verifyAgentProposalExecutionRunbook({
    ...params,
    previewPath: params.previewPath,
    previewJson,
    runbookMarkdown: runbook.markdown,
  });
  const failures = [...previewVerification.failures, ...runbookVerification.failures];

  return {
    passed: failures.length === 0,
    failures,
    preview: { path: params.previewPath, json: previewJson },
    runbook: { path: params.runbookPath, markdown: runbook.markdown },
    previewVerification,
    runbookVerification,
  };
}
