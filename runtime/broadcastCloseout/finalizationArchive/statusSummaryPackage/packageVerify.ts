import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummary } from "../statusSummary/verify.js";

import type {
  AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackage,
  CreateAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageParams,
} from "./package.js";

export interface VerifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageParams
  extends Omit<CreateAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageParams, "generatedAt"> {
  finalizationArchiveStatusSummaryPackageJson: string;
}

export interface AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageVerification {
  passed: boolean;
  failures: string[];
}

export function verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackage(
  params: VerifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageParams,
): AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageVerification {
  const failures: string[] = [];
  const packageManifest = parsePackage(params.finalizationArchiveStatusSummaryPackageJson, failures);
  if (packageManifest === null) {
    return {
      passed: false,
      failures,
    };
  }

  if (
    packageManifest.finalizationArchiveStatusSummaryPackagePath !== undefined
    && packageManifest.finalizationArchiveStatusSummaryPackagePath !== params.finalizationArchiveStatusSummaryPackagePath
  ) {
    failures.push(
      "finalizationArchiveStatusSummaryPackagePath does not match finalization archive status summary package argument",
    );
  }
  verifyEvidenceFile(
    packageManifest.finalizationArchiveStatusSummary,
    "finalizationArchiveStatusSummary",
    params.finalizationArchiveStatusSummaryPath,
    params.finalizationArchiveStatusSummaryMarkdown,
    failures,
  );
  verifyEvidenceFile(
    packageManifest.finalizationArchiveStatus,
    "finalizationArchiveStatus",
    params.finalizationArchiveStatusPath,
    params.finalizationArchiveStatusJson,
    failures,
  );
  verifyEvidenceFile(
    packageManifest.finalizationArchive,
    "finalizationArchive",
    params.finalizationArchivePath,
    params.finalizationArchiveJson,
    failures,
  );
  verifyEvidenceFile(packageManifest.report, "report", params.reportPath, params.reportMarkdown, failures);
  verifyEvidenceFile(packageManifest.archive, "archive", params.archivePath, params.archiveJson, failures);
  verifyEvidenceFile(packageManifest.status, "status", params.statusPath, params.statusJson, failures);
  verifyEvidenceFile(packageManifest.summary, "summary", params.summaryPath, params.summaryMarkdown, failures);
  verifyEvidenceFile(
    packageManifest.finalizationStatus,
    "finalizationStatus",
    params.finalizationStatusPath,
    params.finalizationStatusJson,
    failures,
  );
  verifyEvidenceFile(packageManifest.receipt, "receipt", params.broadcastReceiptPath, params.broadcastReceiptJson, failures);
  verifyEvidenceFile(
    packageManifest.broadcastPackage,
    "broadcastPackage",
    params.broadcastPackagePath,
    params.broadcastPackageJson,
    failures,
  );
  verifyEvidenceFile(packageManifest.submitResult, "submitResult", params.submitResultPath, params.submitResultJson, failures);

  const expectedVerification = verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummary(params);
  if (!isDeepStrictEqual(packageManifest.verification, expectedVerification)) {
    failures.push(
      "finalization archive status summary verification does not match current finalization archive status summary package evidence",
    );
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

function parsePackage(
  json: string,
  failures: string[],
): AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackage | null {
  try {
    const value = JSON.parse(json);
    if (!isRecord(value)) {
      failures.push("finalization archive status summary package must be a JSON object");
      return null;
    }
    if (value.schemaVersion !== 1) {
      failures.push("finalization archive status summary package schemaVersion must be 1");
    }
    if (typeof value.generatedAt !== "string" || Number.isNaN(Date.parse(value.generatedAt))) {
      failures.push("finalization archive status summary package generatedAt must be a valid timestamp");
    }
    return value as unknown as AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackage;
  } catch (error) {
    failures.push(
      `finalization archive status summary package JSON is malformed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}

function verifyEvidenceFile(
  value: unknown,
  name:
    | "finalizationArchiveStatusSummary"
    | "finalizationArchiveStatus"
    | "finalizationArchive"
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
