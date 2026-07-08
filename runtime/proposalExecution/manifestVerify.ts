import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { verifyAgentProposalExecutionPreflight } from "./preflight.js";

import type { VerifyAgentProposalExecutionPreflightParams } from "./preflight.js";

export interface VerifyAgentProposalExecutionManifestParams extends VerifyAgentProposalExecutionPreflightParams {
  executionManifestJson: string;
}

export interface AgentProposalExecutionManifestVerification {
  passed: boolean;
  failures: string[];
}

export function verifyAgentProposalExecutionManifest(
  params: VerifyAgentProposalExecutionManifestParams,
): AgentProposalExecutionManifestVerification {
  let manifest: unknown;
  try {
    manifest = JSON.parse(params.executionManifestJson);
  } catch (error) {
    return {
      passed: false,
      failures: [`execution manifest JSON is malformed: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  if (!isRecord(manifest)) return { passed: false, failures: ["execution manifest must be a JSON object"] };

  const failures: string[] = [];
  if (manifest.schemaVersion !== 1) failures.push("execution manifest schemaVersion must be 1");
  if (typeof manifest.generatedAt !== "string" || Number.isNaN(Date.parse(manifest.generatedAt))) {
    failures.push("execution manifest generatedAt must be a valid timestamp");
  }

  verifyEvidenceFile(manifest.preview, "preview", params.previewPath, params.previewJson, failures);
  verifyEvidenceFile(manifest.runbook, "runbook", params.runbookPath, params.runbookMarkdown, failures);
  verifyEvidenceFile(manifest.bundle, "bundle", params.bundlePath, params.bundleJson, failures);
  verifyEvidenceFile(manifest.approval, "approval", params.approvalPath, params.approvalJson, failures);
  verifyEvidenceFile(manifest.reviewManifest, "reviewManifest", params.manifestPath, params.manifestJson, failures);
  verifyEvidenceFile(manifest.proposal, "proposal", params.proposalPath, params.proposalJson, failures);
  verifyEvidenceFile(manifest.summary, "summary", params.summaryPath, params.summaryMarkdown, failures);

  const expectedPreflight = verifyAgentProposalExecutionPreflight(params);
  if (!isDeepStrictEqual(manifest.preflight, expectedPreflight)) {
    failures.push("preflight report does not match current execution handoff");
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

function verifyEvidenceFile(
  value: unknown,
  name: "preview" | "runbook" | "bundle" | "approval" | "reviewManifest" | "proposal" | "summary",
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

  if (value.sha256 !== sha256(contents)) failures.push(`${name} sha256 does not match current ${name}`);
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
