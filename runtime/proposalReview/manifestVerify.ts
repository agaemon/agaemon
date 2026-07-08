import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { verifyAgentProposalReviewPreflight } from "./preflight.js";

export interface VerifyAgentProposalReviewManifestParams {
  manifestJson: string;
  proposalPath: string;
  proposalJson: string;
  summaryPath: string;
  summaryMarkdown: string;
}

export interface AgentProposalReviewManifestVerification {
  passed: boolean;
  failures: string[];
}

export function verifyAgentProposalReviewManifest(
  params: VerifyAgentProposalReviewManifestParams,
): AgentProposalReviewManifestVerification {
  let manifest: unknown;
  try {
    manifest = JSON.parse(params.manifestJson);
  } catch (error) {
    return {
      passed: false,
      failures: [`manifest JSON is malformed: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  if (!isRecord(manifest)) return { passed: false, failures: ["manifest must be a JSON object"] };

  const failures: string[] = [];
  if (manifest.schemaVersion !== 1) failures.push("manifest schemaVersion must be 1");
  if (typeof manifest.generatedAt !== "string" || Number.isNaN(Date.parse(manifest.generatedAt))) {
    failures.push("manifest generatedAt must be a valid timestamp");
  }

  verifyEvidenceFile(manifest.proposal, "proposal", params.proposalPath, params.proposalJson, failures);
  verifyEvidenceFile(manifest.summary, "summary", params.summaryPath, params.summaryMarkdown, failures);

  const expectedPreflight = verifyAgentProposalReviewPreflight({
    proposalPath: params.proposalPath,
    proposalJson: params.proposalJson,
    summaryPath: params.summaryPath,
    summaryMarkdown: params.summaryMarkdown,
  });
  if (!isDeepStrictEqual(manifest.preflight, expectedPreflight)) {
    failures.push("preflight report does not match current proposal review");
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

function verifyEvidenceFile(
  value: unknown,
  name: "proposal" | "summary",
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
