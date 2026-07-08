import { isDeepStrictEqual } from "node:util";

import { createAgentProposalExecutionPreview } from "./preview.js";

import type {
  AgentProposalExecutionPreviewResult,
  CreateAgentProposalExecutionPreviewParams,
} from "./preview.js";

export interface VerifyAgentProposalExecutionPreviewParams extends CreateAgentProposalExecutionPreviewParams {
  previewJson: string;
}

export interface AgentProposalExecutionPreviewVerification {
  passed: boolean;
  failures: string[];
  previewResult: AgentProposalExecutionPreviewResult;
}

export function verifyAgentProposalExecutionPreview(
  params: VerifyAgentProposalExecutionPreviewParams,
): AgentProposalExecutionPreviewVerification {
  const expected = createAgentProposalExecutionPreview(params);
  let preview: unknown;
  try {
    preview = JSON.parse(params.previewJson);
  } catch (error) {
    return {
      passed: false,
      failures: [`preview JSON is malformed: ${error instanceof Error ? error.message : String(error)}`],
      previewResult: expected,
    };
  }

  if (!isRecord(preview)) {
    return {
      passed: false,
      failures: ["preview must be a JSON object"],
      previewResult: expected,
    };
  }

  const failures = [...expected.failures];
  if (preview.schemaVersion !== 1) failures.push("preview schemaVersion must be 1");
  if (typeof preview.generatedAt !== "string" || Number.isNaN(Date.parse(preview.generatedAt))) {
    failures.push("preview generatedAt must be a valid timestamp");
  }

  if (expected.preview !== null) {
    if (preview.chainId !== expected.preview.chainId) failures.push("preview chainId does not match current execution bundle");
    if (preview.objective !== expected.preview.objective) {
      failures.push("preview objective does not match current execution bundle");
    }
    if (preview.agent !== expected.preview.agent) failures.push("preview agent does not match current execution bundle");
    verifyBundleEvidence(preview.bundle, expected.preview.bundle, failures);
    if (!isDeepStrictEqual(preview.transactions, expected.preview.transactions)) {
      failures.push("preview transactions do not match current execution bundle");
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    previewResult: expected,
  };
}

function verifyBundleEvidence(
  actual: unknown,
  expected: { path: string; sha256: string },
  failures: string[],
): void {
  if (!isRecord(actual)) {
    failures.push("preview bundle must be an object");
    return;
  }
  if (actual.path !== expected.path) failures.push("preview bundle path does not match bundle argument");
  if (actual.sha256 !== expected.sha256) failures.push("preview bundle sha256 does not match current bundle");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
