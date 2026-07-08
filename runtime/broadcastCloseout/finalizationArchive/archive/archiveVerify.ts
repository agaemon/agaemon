import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { verifyAgentProposalExecutionBroadcastCloseoutFinalizationStatus } from "../../finalization/status/statusVerify.js";

import type {
  AgentProposalExecutionBroadcastCloseoutFinalizationArchive,
  CreateAgentProposalExecutionBroadcastCloseoutFinalizationArchiveParams,
} from "./archive.js";

export interface VerifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveParams
  extends Omit<CreateAgentProposalExecutionBroadcastCloseoutFinalizationArchiveParams, "generatedAt"> {
  finalizationArchiveJson: string;
}

export interface AgentProposalExecutionBroadcastCloseoutFinalizationArchiveVerification {
  passed: boolean;
  failures: string[];
}

export function verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchive(
  params: VerifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveParams,
): AgentProposalExecutionBroadcastCloseoutFinalizationArchiveVerification {
  const failures: string[] = [];
  const archive = parseArchive(params.finalizationArchiveJson, failures);
  if (archive === null) {
    return {
      passed: false,
      failures,
    };
  }

  if (archive.finalizationArchivePath !== undefined && archive.finalizationArchivePath !== params.finalizationArchivePath) {
    failures.push("finalizationArchivePath does not match finalization archive argument");
  }
  verifyEvidenceFile(archive.report, "report", params.reportPath, params.reportMarkdown, failures);
  verifyEvidenceFile(archive.archive, "archive", params.archivePath, params.archiveJson, failures);
  verifyEvidenceFile(archive.status, "status", params.statusPath, params.statusJson, failures);
  verifyEvidenceFile(archive.summary, "summary", params.summaryPath, params.summaryMarkdown, failures);
  verifyEvidenceFile(
    archive.finalizationStatus,
    "finalizationStatus",
    params.finalizationStatusPath,
    params.finalizationStatusJson,
    failures,
  );
  verifyEvidenceFile(archive.receipt, "receipt", params.broadcastReceiptPath, params.broadcastReceiptJson, failures);
  verifyEvidenceFile(
    archive.broadcastPackage,
    "broadcastPackage",
    params.broadcastPackagePath,
    params.broadcastPackageJson,
    failures,
  );
  verifyEvidenceFile(archive.submitResult, "submitResult", params.submitResultPath, params.submitResultJson, failures);

  const expectedVerification = verifyAgentProposalExecutionBroadcastCloseoutFinalizationStatus(params);
  if (!isDeepStrictEqual(archive.verification, expectedVerification)) {
    failures.push("finalization status verification does not match current finalization archive evidence");
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

function parseArchive(
  json: string,
  failures: string[],
): AgentProposalExecutionBroadcastCloseoutFinalizationArchive | null {
  try {
    const value = JSON.parse(json);
    if (!isRecord(value)) {
      failures.push("finalization archive must be a JSON object");
      return null;
    }
    if (value.schemaVersion !== 1) failures.push("finalization archive schemaVersion must be 1");
    if (typeof value.generatedAt !== "string" || Number.isNaN(Date.parse(value.generatedAt))) {
      failures.push("finalization archive generatedAt must be a valid timestamp");
    }
    return value as unknown as AgentProposalExecutionBroadcastCloseoutFinalizationArchive;
  } catch (error) {
    failures.push(`finalization archive JSON is malformed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function verifyEvidenceFile(
  value: unknown,
  name:
    | "report"
    | "archive"
    | "status"
    | "summary"
    | "finalizationStatus"
    | "receipt"
    | "broadcastPackage"
    | "submitResult",
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
