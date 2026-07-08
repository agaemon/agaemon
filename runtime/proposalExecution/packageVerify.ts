import { createAgentProposalExecutionPackage } from "./package.js";
import { verifyAgentProposalExecutionPreview } from "./previewVerify.js";
import { verifyAgentProposalExecutionRunbook } from "./runbookVerify.js";

import type {
  AgentProposalExecutionPackage,
  CreateAgentProposalExecutionPackageParams,
} from "./package.js";
import type { AgentProposalExecutionPreviewVerification } from "./previewVerify.js";
import type { AgentProposalExecutionRunbookVerification } from "./runbookVerify.js";

export interface VerifyAgentProposalExecutionPackageParams extends CreateAgentProposalExecutionPackageParams {
  previewJson: string;
  runbookMarkdown: string;
}

export interface AgentProposalExecutionPackageVerification {
  passed: boolean;
  failures: string[];
  packageResult: AgentProposalExecutionPackage;
  previewVerification: AgentProposalExecutionPreviewVerification;
  runbookVerification: AgentProposalExecutionRunbookVerification;
}

export function verifyAgentProposalExecutionPackage(
  params: VerifyAgentProposalExecutionPackageParams,
): AgentProposalExecutionPackageVerification {
  const recomputeParams = {
    ...params,
    generatedAt: params.generatedAt ?? readPreviewGeneratedAt(params.previewJson),
  };
  const packageResult = createAgentProposalExecutionPackage(recomputeParams);
  const previewVerification = verifyAgentProposalExecutionPreview(recomputeParams);
  const runbookVerification = verifyAgentProposalExecutionRunbook({
    ...recomputeParams,
    previewJson: params.previewJson,
  });
  const failures = uniqueFailures([...previewVerification.failures, ...runbookVerification.failures]);

  if (packageResult.passed && params.previewJson !== packageResult.preview.json) {
    addFailure(failures, "package preview JSON does not match current execution package");
  }
  if (packageResult.passed && params.runbookMarkdown !== packageResult.runbook.markdown) {
    addFailure(failures, "package runbook Markdown does not match current execution package");
  }

  return {
    passed: failures.length === 0,
    failures,
    packageResult,
    previewVerification,
    runbookVerification,
  };
}

function uniqueFailures(failures: string[]): string[] {
  return [...new Set(failures)];
}

function addFailure(failures: string[], failure: string): void {
  if (!failures.includes(failure)) failures.push(failure);
}

function readPreviewGeneratedAt(previewJson: string): string | undefined {
  try {
    const preview = JSON.parse(previewJson);
    if (typeof preview === "object" && preview !== null && !Array.isArray(preview)) {
      const generatedAt = (preview as Record<string, unknown>).generatedAt;
      if (typeof generatedAt === "string") return generatedAt;
    }
  } catch {
    return undefined;
  }
  return undefined;
}
