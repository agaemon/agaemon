import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { verifyAgentProposalExecutionBroadcastReport } from "./reportVerify.js";

import type {
  AgentProposalExecutionBroadcastArchive,
  CreateAgentProposalExecutionBroadcastArchiveParams,
} from "./archive.js";

export interface VerifyAgentProposalExecutionBroadcastArchiveParams
  extends Omit<CreateAgentProposalExecutionBroadcastArchiveParams, "generatedAt"> {
  archiveJson: string;
}

export interface AgentProposalExecutionBroadcastArchiveVerification {
  passed: boolean;
  failures: string[];
}

export function verifyAgentProposalExecutionBroadcastArchive(
  params: VerifyAgentProposalExecutionBroadcastArchiveParams,
): AgentProposalExecutionBroadcastArchiveVerification {
  const failures: string[] = [];
  const archive = parseArchive(params.archiveJson, failures);
  if (archive === null) {
    return {
      passed: false,
      failures,
    };
  }

  if (archive.archivePath !== undefined && archive.archivePath !== params.archivePath) {
    failures.push("archivePath does not match archive argument");
  }
  verifyEvidenceFile(archive.report, "report", params.reportPath, params.reportMarkdown, failures);
  verifyEvidenceFile(archive.receipt, "receipt", params.broadcastReceiptPath, params.broadcastReceiptJson, failures);
  verifyEvidenceFile(
    archive.broadcastPackage,
    "broadcastPackage",
    params.broadcastPackagePath,
    params.broadcastPackageJson,
    failures,
  );
  verifyEvidenceFile(archive.submitResult, "submitResult", params.submitResultPath, params.submitResultJson, failures);

  const expectedVerification = verifyAgentProposalExecutionBroadcastReport(params);
  if (!isDeepStrictEqual(archive.verification, expectedVerification)) {
    failures.push("report verification does not match current broadcast archive evidence");
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

function parseArchive(json: string, failures: string[]): AgentProposalExecutionBroadcastArchive | null {
  try {
    const value = JSON.parse(json);
    if (!isRecord(value)) {
      failures.push("broadcast archive must be a JSON object");
      return null;
    }
    if (value.schemaVersion !== 1) failures.push("broadcast archive schemaVersion must be 1");
    if (typeof value.generatedAt !== "string" || Number.isNaN(Date.parse(value.generatedAt))) {
      failures.push("broadcast archive generatedAt must be a valid timestamp");
    }
    return value as unknown as AgentProposalExecutionBroadcastArchive;
  } catch (error) {
    failures.push(`broadcast archive JSON is malformed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function verifyEvidenceFile(
  value: unknown,
  name: "report" | "receipt" | "broadcastPackage" | "submitResult",
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
