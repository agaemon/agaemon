import { createAgentProposalExecutionBroadcastCloseoutEvidenceSet } from "../../evidenceSet/set.js";
import { createAgentProposalExecutionBroadcastCloseoutEvidenceSetSummary } from "../../evidenceSet/summary.js";
import { createAgentProposalExecutionBroadcastCloseoutFinalizationArchive } from "../../finalizationArchive/archive/archive.js";
import {
  createAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus,
  formatAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus,
} from "../../finalizationArchive/status/status.js";
import { createAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummary } from "../../finalizationArchive/statusSummary/summary.js";
import { createAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackage } from "../../finalizationArchive/statusSummaryPackage/package.js";
import {
  createAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatus,
  formatAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatus,
} from "../../finalizationArchive/statusSummaryPackage/status.js";
import {
  createAgentProposalExecutionBroadcastCloseoutFinalizationStatus,
  formatAgentProposalExecutionBroadcastCloseoutFinalizationStatus,
} from "../status/status.js";
import { verifyAgentProposalExecutionBroadcastCloseoutEvidenceSetSummary } from "../../evidenceSet/summaryVerify.js";
import { verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchive } from "../../finalizationArchive/archive/archiveVerify.js";
import { verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus } from "../../finalizationArchive/status/statusVerify.js";
import { verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummary } from "../../finalizationArchive/statusSummary/verify.js";
import { verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackage } from "../../finalizationArchive/statusSummaryPackage/packageVerify.js";
import { verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatus } from "../../finalizationArchive/statusSummaryPackage/statusVerify.js";

import type {
  AgentProposalExecutionBroadcastCloseoutEvidenceSet,
  CreateAgentProposalExecutionBroadcastCloseoutEvidenceSetParams,
} from "../../evidenceSet/set.js";
import type {
  AgentProposalExecutionBroadcastCloseoutEvidenceSetSummaryVerification,
} from "../../evidenceSet/summaryVerify.js";

export interface CreateAgentProposalExecutionBroadcastCloseoutFinalizationParams
  extends CreateAgentProposalExecutionBroadcastCloseoutEvidenceSetParams {
  statusPath: string;
  summaryPath: string;
  finalizationStatusPath?: string | undefined;
  finalizationArchivePath?: string | undefined;
  finalizationArchiveStatusPath?: string | undefined;
  finalizationArchiveStatusSummaryPath?: string | undefined;
  finalizationArchiveStatusSummaryPackagePath?: string | undefined;
  finalizationArchiveStatusSummaryPackageStatusPath?: string | undefined;
}

export interface AgentProposalExecutionBroadcastCloseoutFinalization {
  passed: boolean;
  failures: string[];
  report: AgentProposalExecutionBroadcastCloseoutEvidenceSet["report"];
  archive: AgentProposalExecutionBroadcastCloseoutEvidenceSet["archive"];
  status: AgentProposalExecutionBroadcastCloseoutEvidenceSet["status"];
  summary: {
    path: string;
    markdown: string;
  };
  finalizationStatus: {
    path: string;
    json: string;
  } | null;
  finalizationArchive: {
    path: string;
    json: string;
  } | null;
  finalizationArchiveStatus: {
    path: string;
    json: string;
  } | null;
  finalizationArchiveStatusSummary: {
    path: string;
    markdown: string;
  } | null;
  finalizationArchiveStatusSummaryPackage: {
    path: string;
    json: string;
  } | null;
  finalizationArchiveStatusSummaryPackageStatus: {
    path: string;
    json: string;
  } | null;
  verification: AgentProposalExecutionBroadcastCloseoutEvidenceSetSummaryVerification;
}

export function createAgentProposalExecutionBroadcastCloseoutFinalization(
  params: CreateAgentProposalExecutionBroadcastCloseoutFinalizationParams,
): AgentProposalExecutionBroadcastCloseoutFinalization {
  const evidenceSet = createAgentProposalExecutionBroadcastCloseoutEvidenceSet(params);
  if (!evidenceSet.passed || evidenceSet.status === null) {
    return failedFinalization(params.summaryPath, evidenceSet, evidenceSet.failures);
  }
  if (params.finalizationArchivePath !== undefined && params.finalizationStatusPath === undefined) {
    return failedFinalization(
      params.summaryPath,
      evidenceSet,
      ["finalization archive output requires finalization status output"],
    );
  }
  if (params.finalizationArchiveStatusPath !== undefined && params.finalizationArchivePath === undefined) {
    return failedFinalization(
      params.summaryPath,
      evidenceSet,
      ["finalization archive status output requires finalization archive output"],
    );
  }
  if (
    params.finalizationArchiveStatusSummaryPath !== undefined &&
    params.finalizationArchiveStatusPath === undefined
  ) {
    return failedFinalization(
      params.summaryPath,
      evidenceSet,
      ["finalization archive status summary output requires finalization archive status output"],
    );
  }
  if (
    params.finalizationArchiveStatusSummaryPackagePath !== undefined &&
    params.finalizationArchiveStatusSummaryPath === undefined
  ) {
    return failedFinalization(
      params.summaryPath,
      evidenceSet,
      ["finalization archive status summary package output requires finalization archive status summary output"],
    );
  }
  if (
    params.finalizationArchiveStatusSummaryPackageStatusPath !== undefined &&
    params.finalizationArchiveStatusSummaryPackagePath === undefined
  ) {
    return failedFinalization(
      params.summaryPath,
      evidenceSet,
      ["finalization archive status summary package status output requires finalization archive status summary package output"],
    );
  }

  const summary = createAgentProposalExecutionBroadcastCloseoutEvidenceSetSummary({
    reportPath: evidenceSet.report.path,
    reportMarkdown: evidenceSet.report.markdown,
    archivePath: evidenceSet.archive.path,
    archiveJson: evidenceSet.archive.json,
    statusPath: evidenceSet.status.path,
    statusJson: evidenceSet.status.json,
    broadcastReceiptPath: params.broadcastReceiptPath,
    broadcastReceiptJson: params.broadcastReceiptJson,
    broadcastPackagePath: params.broadcastPackagePath,
    broadcastPackageJson: params.broadcastPackageJson,
    submitResultPath: params.submitResultPath,
    submitResultJson: params.submitResultJson,
  });
  if (!summary.passed) {
    return failedFinalization(params.summaryPath, evidenceSet, summary.failures);
  }

  const verification = verifyAgentProposalExecutionBroadcastCloseoutEvidenceSetSummary({
    summaryMarkdown: summary.markdown,
    reportPath: evidenceSet.report.path,
    reportMarkdown: evidenceSet.report.markdown,
    archivePath: evidenceSet.archive.path,
    archiveJson: evidenceSet.archive.json,
    statusPath: evidenceSet.status.path,
    statusJson: evidenceSet.status.json,
    broadcastReceiptPath: params.broadcastReceiptPath,
    broadcastReceiptJson: params.broadcastReceiptJson,
    broadcastPackagePath: params.broadcastPackagePath,
    broadcastPackageJson: params.broadcastPackageJson,
    submitResultPath: params.submitResultPath,
    submitResultJson: params.submitResultJson,
  });

  const finalizationStatus = params.finalizationStatusPath === undefined
    ? null
    : createFinalizationStatus(params, evidenceSet, evidenceSet.status, summary.markdown);
  const finalizationArchive = verification.passed && finalizationStatus !== null && params.finalizationArchivePath !== undefined
    ? createFinalizationArchive(params, evidenceSet, evidenceSet.status, summary.markdown, finalizationStatus)
    : null;
  const finalizationArchiveStatus =
    finalizationArchive?.verification.passed === true &&
    finalizationArchive.artifact !== null &&
    finalizationStatus !== null &&
    params.finalizationArchiveStatusPath !== undefined
      ? createFinalizationArchiveStatus(
          params,
          evidenceSet,
          evidenceSet.status,
          summary.markdown,
          finalizationStatus,
          finalizationArchive.artifact,
        )
      : null;
  const finalizationArchiveStatusSummary =
    finalizationArchiveStatus?.verification.passed === true &&
    finalizationArchiveStatus.artifact !== null &&
    finalizationArchive !== null &&
    finalizationArchive.artifact !== null &&
    finalizationStatus !== null &&
    params.finalizationArchiveStatusSummaryPath !== undefined
      ? createFinalizationArchiveStatusSummary(
          params,
          evidenceSet,
          evidenceSet.status,
          summary.markdown,
          finalizationStatus,
          finalizationArchive.artifact,
          finalizationArchiveStatus.artifact,
        )
      : null;
  const finalizationArchiveStatusSummaryPackage =
    finalizationArchiveStatusSummary?.verification.passed === true &&
    finalizationArchiveStatusSummary.artifact !== null &&
    finalizationArchiveStatus !== null &&
    finalizationArchiveStatus.artifact !== null &&
    finalizationArchive !== null &&
    finalizationArchive.artifact !== null &&
    finalizationStatus !== null &&
    params.finalizationArchiveStatusSummaryPackagePath !== undefined
      ? createFinalizationArchiveStatusSummaryPackage(
          params,
          evidenceSet,
          evidenceSet.status,
          summary.markdown,
          finalizationStatus,
          finalizationArchive.artifact,
          finalizationArchiveStatus.artifact,
          finalizationArchiveStatusSummary.artifact,
        )
      : null;
  const finalizationArchiveStatusSummaryPackageStatus =
    finalizationArchiveStatusSummaryPackage?.verification.passed === true &&
    finalizationArchiveStatusSummaryPackage.artifact !== null &&
    finalizationArchiveStatusSummary !== null &&
    finalizationArchiveStatusSummary.artifact !== null &&
    finalizationArchiveStatus !== null &&
    finalizationArchiveStatus.artifact !== null &&
    finalizationArchive !== null &&
    finalizationArchive.artifact !== null &&
    finalizationStatus !== null &&
    params.finalizationArchiveStatusSummaryPackageStatusPath !== undefined
      ? createFinalizationArchiveStatusSummaryPackageStatus(
          params,
          evidenceSet,
          evidenceSet.status,
          summary.markdown,
          finalizationStatus,
          finalizationArchive.artifact,
          finalizationArchiveStatus.artifact,
          finalizationArchiveStatusSummary.artifact,
          finalizationArchiveStatusSummaryPackage.artifact,
        )
      : null;
  const archiveFailures = finalizationArchive?.verification.failures ?? [];
  const archiveStatusFailures = finalizationArchiveStatus?.verification.failures ?? [];
  const archiveStatusSummaryFailures = finalizationArchiveStatusSummary?.verification.failures ?? [];
  const archiveStatusSummaryPackageFailures = finalizationArchiveStatusSummaryPackage?.verification.failures ?? [];
  const archiveStatusSummaryPackageStatusFailures =
    finalizationArchiveStatusSummaryPackageStatus?.verification.failures ?? [];
  const passed =
    verification.passed &&
    (finalizationArchive?.verification.passed ?? true) &&
    (finalizationArchiveStatus?.verification.passed ?? true) &&
    (finalizationArchiveStatusSummary?.verification.passed ?? true) &&
    (finalizationArchiveStatusSummaryPackage?.verification.passed ?? true) &&
    (finalizationArchiveStatusSummaryPackageStatus?.verification.passed ?? true);
  const failures = [
    ...verification.failures,
    ...archiveFailures,
    ...archiveStatusFailures,
    ...archiveStatusSummaryFailures,
    ...archiveStatusSummaryPackageFailures,
    ...archiveStatusSummaryPackageStatusFailures,
  ];

  return {
    passed,
    failures,
    report: evidenceSet.report,
    archive: evidenceSet.archive,
    status: evidenceSet.status,
    summary: {
      path: params.summaryPath,
      markdown: passed ? summary.markdown : "",
    },
    finalizationStatus: passed ? finalizationStatus : null,
    finalizationArchive: passed ? finalizationArchive?.artifact ?? null : null,
    finalizationArchiveStatus: passed ? finalizationArchiveStatus?.artifact ?? null : null,
    finalizationArchiveStatusSummary: passed ? finalizationArchiveStatusSummary?.artifact ?? null : null,
    finalizationArchiveStatusSummaryPackage: passed ? finalizationArchiveStatusSummaryPackage?.artifact ?? null : null,
    finalizationArchiveStatusSummaryPackageStatus: passed
      ? finalizationArchiveStatusSummaryPackageStatus?.artifact ?? null
      : null,
    verification,
  };
}

function createFinalizationStatus(
  params: CreateAgentProposalExecutionBroadcastCloseoutFinalizationParams,
  evidenceSet: AgentProposalExecutionBroadcastCloseoutEvidenceSet,
  statusArtifact: NonNullable<AgentProposalExecutionBroadcastCloseoutEvidenceSet["status"]>,
  summaryMarkdown: string,
): NonNullable<AgentProposalExecutionBroadcastCloseoutFinalization["finalizationStatus"]> | null {
  if (params.finalizationStatusPath === undefined) return null;

  const status = createAgentProposalExecutionBroadcastCloseoutFinalizationStatus({
    summaryPath: params.summaryPath,
    summaryMarkdown,
    reportPath: evidenceSet.report.path,
    reportMarkdown: evidenceSet.report.markdown,
    archivePath: evidenceSet.archive.path,
    archiveJson: evidenceSet.archive.json,
    statusPath: statusArtifact.path,
    statusJson: statusArtifact.json,
    broadcastReceiptPath: params.broadcastReceiptPath,
    broadcastReceiptJson: params.broadcastReceiptJson,
    broadcastPackagePath: params.broadcastPackagePath,
    broadcastPackageJson: params.broadcastPackageJson,
    submitResultPath: params.submitResultPath,
    submitResultJson: params.submitResultJson,
  });

  return {
    path: params.finalizationStatusPath,
    json: formatAgentProposalExecutionBroadcastCloseoutFinalizationStatus(status),
  };
}

function createFinalizationArchive(
  params: CreateAgentProposalExecutionBroadcastCloseoutFinalizationParams,
  evidenceSet: AgentProposalExecutionBroadcastCloseoutEvidenceSet,
  statusArtifact: NonNullable<AgentProposalExecutionBroadcastCloseoutEvidenceSet["status"]>,
  summaryMarkdown: string,
  finalizationStatus: NonNullable<AgentProposalExecutionBroadcastCloseoutFinalization["finalizationStatus"]>,
): {
  artifact: NonNullable<AgentProposalExecutionBroadcastCloseoutFinalization["finalizationArchive"]>;
  verification: ReturnType<typeof verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchive>;
} {
  if (params.finalizationArchivePath === undefined) throw new Error("finalizationArchivePath is required");

  const archive = createAgentProposalExecutionBroadcastCloseoutFinalizationArchive({
    finalizationArchivePath: params.finalizationArchivePath,
    reportPath: evidenceSet.report.path,
    reportMarkdown: evidenceSet.report.markdown,
    archivePath: evidenceSet.archive.path,
    archiveJson: evidenceSet.archive.json,
    statusPath: statusArtifact.path,
    statusJson: statusArtifact.json,
    summaryPath: params.summaryPath,
    summaryMarkdown,
    finalizationStatusPath: finalizationStatus.path,
    finalizationStatusJson: finalizationStatus.json,
    broadcastReceiptPath: params.broadcastReceiptPath,
    broadcastReceiptJson: params.broadcastReceiptJson,
    broadcastPackagePath: params.broadcastPackagePath,
    broadcastPackageJson: params.broadcastPackageJson,
    submitResultPath: params.submitResultPath,
    submitResultJson: params.submitResultJson,
    generatedAt: params.generatedAt,
  });
  const archiveJson = `${JSON.stringify(archive, null, 2)}\n`;
  const verification = verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchive({
    finalizationArchivePath: params.finalizationArchivePath,
    finalizationArchiveJson: archiveJson,
    reportPath: evidenceSet.report.path,
    reportMarkdown: evidenceSet.report.markdown,
    archivePath: evidenceSet.archive.path,
    archiveJson: evidenceSet.archive.json,
    statusPath: statusArtifact.path,
    statusJson: statusArtifact.json,
    summaryPath: params.summaryPath,
    summaryMarkdown,
    finalizationStatusPath: finalizationStatus.path,
    finalizationStatusJson: finalizationStatus.json,
    broadcastReceiptPath: params.broadcastReceiptPath,
    broadcastReceiptJson: params.broadcastReceiptJson,
    broadcastPackagePath: params.broadcastPackagePath,
    broadcastPackageJson: params.broadcastPackageJson,
    submitResultPath: params.submitResultPath,
    submitResultJson: params.submitResultJson,
  });

  return {
    artifact: {
      path: params.finalizationArchivePath,
      json: archiveJson,
    },
    verification,
  };
}

function createFinalizationArchiveStatus(
  params: CreateAgentProposalExecutionBroadcastCloseoutFinalizationParams,
  evidenceSet: AgentProposalExecutionBroadcastCloseoutEvidenceSet,
  statusArtifact: NonNullable<AgentProposalExecutionBroadcastCloseoutEvidenceSet["status"]>,
  summaryMarkdown: string,
  finalizationStatus: NonNullable<AgentProposalExecutionBroadcastCloseoutFinalization["finalizationStatus"]>,
  finalizationArchive: NonNullable<AgentProposalExecutionBroadcastCloseoutFinalization["finalizationArchive"]>,
): {
  artifact: NonNullable<AgentProposalExecutionBroadcastCloseoutFinalization["finalizationArchiveStatus"]>;
  verification: ReturnType<typeof verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus>;
} {
  if (params.finalizationArchiveStatusPath === undefined) throw new Error("finalizationArchiveStatusPath is required");

  const status = createAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus({
    finalizationArchivePath: finalizationArchive.path,
    finalizationArchiveJson: finalizationArchive.json,
    reportPath: evidenceSet.report.path,
    reportMarkdown: evidenceSet.report.markdown,
    archivePath: evidenceSet.archive.path,
    archiveJson: evidenceSet.archive.json,
    statusPath: statusArtifact.path,
    statusJson: statusArtifact.json,
    summaryPath: params.summaryPath,
    summaryMarkdown,
    finalizationStatusPath: finalizationStatus.path,
    finalizationStatusJson: finalizationStatus.json,
    broadcastReceiptPath: params.broadcastReceiptPath,
    broadcastReceiptJson: params.broadcastReceiptJson,
    broadcastPackagePath: params.broadcastPackagePath,
    broadcastPackageJson: params.broadcastPackageJson,
    submitResultPath: params.submitResultPath,
    submitResultJson: params.submitResultJson,
  });
  const statusJson = formatAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus(status);
  const verification = verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus({
    finalizationArchiveStatusJson: statusJson,
    finalizationArchivePath: finalizationArchive.path,
    finalizationArchiveJson: finalizationArchive.json,
    reportPath: evidenceSet.report.path,
    reportMarkdown: evidenceSet.report.markdown,
    archivePath: evidenceSet.archive.path,
    archiveJson: evidenceSet.archive.json,
    statusPath: statusArtifact.path,
    statusJson: statusArtifact.json,
    summaryPath: params.summaryPath,
    summaryMarkdown,
    finalizationStatusPath: finalizationStatus.path,
    finalizationStatusJson: finalizationStatus.json,
    broadcastReceiptPath: params.broadcastReceiptPath,
    broadcastReceiptJson: params.broadcastReceiptJson,
    broadcastPackagePath: params.broadcastPackagePath,
    broadcastPackageJson: params.broadcastPackageJson,
    submitResultPath: params.submitResultPath,
    submitResultJson: params.submitResultJson,
  });

  return {
    artifact: {
      path: params.finalizationArchiveStatusPath,
      json: statusJson,
    },
    verification,
  };
}

function createFinalizationArchiveStatusSummary(
  params: CreateAgentProposalExecutionBroadcastCloseoutFinalizationParams,
  evidenceSet: AgentProposalExecutionBroadcastCloseoutEvidenceSet,
  statusArtifact: NonNullable<AgentProposalExecutionBroadcastCloseoutEvidenceSet["status"]>,
  summaryMarkdown: string,
  finalizationStatus: NonNullable<AgentProposalExecutionBroadcastCloseoutFinalization["finalizationStatus"]>,
  finalizationArchive: NonNullable<AgentProposalExecutionBroadcastCloseoutFinalization["finalizationArchive"]>,
  finalizationArchiveStatus: NonNullable<AgentProposalExecutionBroadcastCloseoutFinalization["finalizationArchiveStatus"]>,
): {
  artifact: NonNullable<AgentProposalExecutionBroadcastCloseoutFinalization["finalizationArchiveStatusSummary"]>;
  verification: ReturnType<typeof verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummary>;
} {
  if (params.finalizationArchiveStatusSummaryPath === undefined) {
    throw new Error("finalizationArchiveStatusSummaryPath is required");
  }

  const summary = createAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummary({
    finalizationArchiveStatusPath: finalizationArchiveStatus.path,
    finalizationArchiveStatusJson: finalizationArchiveStatus.json,
    finalizationArchivePath: finalizationArchive.path,
    finalizationArchiveJson: finalizationArchive.json,
    reportPath: evidenceSet.report.path,
    reportMarkdown: evidenceSet.report.markdown,
    archivePath: evidenceSet.archive.path,
    archiveJson: evidenceSet.archive.json,
    statusPath: statusArtifact.path,
    statusJson: statusArtifact.json,
    summaryPath: params.summaryPath,
    summaryMarkdown,
    finalizationStatusPath: finalizationStatus.path,
    finalizationStatusJson: finalizationStatus.json,
    broadcastReceiptPath: params.broadcastReceiptPath,
    broadcastReceiptJson: params.broadcastReceiptJson,
    broadcastPackagePath: params.broadcastPackagePath,
    broadcastPackageJson: params.broadcastPackageJson,
    submitResultPath: params.submitResultPath,
    submitResultJson: params.submitResultJson,
  });
  const verification = verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummary({
    finalizationArchiveStatusSummaryMarkdown: summary.markdown,
    finalizationArchiveStatusPath: finalizationArchiveStatus.path,
    finalizationArchiveStatusJson: finalizationArchiveStatus.json,
    finalizationArchivePath: finalizationArchive.path,
    finalizationArchiveJson: finalizationArchive.json,
    reportPath: evidenceSet.report.path,
    reportMarkdown: evidenceSet.report.markdown,
    archivePath: evidenceSet.archive.path,
    archiveJson: evidenceSet.archive.json,
    statusPath: statusArtifact.path,
    statusJson: statusArtifact.json,
    summaryPath: params.summaryPath,
    summaryMarkdown,
    finalizationStatusPath: finalizationStatus.path,
    finalizationStatusJson: finalizationStatus.json,
    broadcastReceiptPath: params.broadcastReceiptPath,
    broadcastReceiptJson: params.broadcastReceiptJson,
    broadcastPackagePath: params.broadcastPackagePath,
    broadcastPackageJson: params.broadcastPackageJson,
    submitResultPath: params.submitResultPath,
    submitResultJson: params.submitResultJson,
  });

  return {
    artifact: {
      path: params.finalizationArchiveStatusSummaryPath,
      markdown: summary.markdown,
    },
    verification,
  };
}

function createFinalizationArchiveStatusSummaryPackage(
  params: CreateAgentProposalExecutionBroadcastCloseoutFinalizationParams,
  evidenceSet: AgentProposalExecutionBroadcastCloseoutEvidenceSet,
  statusArtifact: NonNullable<AgentProposalExecutionBroadcastCloseoutEvidenceSet["status"]>,
  summaryMarkdown: string,
  finalizationStatus: NonNullable<AgentProposalExecutionBroadcastCloseoutFinalization["finalizationStatus"]>,
  finalizationArchive: NonNullable<AgentProposalExecutionBroadcastCloseoutFinalization["finalizationArchive"]>,
  finalizationArchiveStatus: NonNullable<AgentProposalExecutionBroadcastCloseoutFinalization["finalizationArchiveStatus"]>,
  finalizationArchiveStatusSummary: NonNullable<
    AgentProposalExecutionBroadcastCloseoutFinalization["finalizationArchiveStatusSummary"]
  >,
): {
  artifact: NonNullable<
    AgentProposalExecutionBroadcastCloseoutFinalization["finalizationArchiveStatusSummaryPackage"]
  >;
  verification: ReturnType<typeof verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackage>;
} {
  if (params.finalizationArchiveStatusSummaryPackagePath === undefined) {
    throw new Error("finalizationArchiveStatusSummaryPackagePath is required");
  }

  const packageManifest = createAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackage({
    finalizationArchiveStatusSummaryPackagePath: params.finalizationArchiveStatusSummaryPackagePath,
    finalizationArchiveStatusSummaryPath: finalizationArchiveStatusSummary.path,
    finalizationArchiveStatusSummaryMarkdown: finalizationArchiveStatusSummary.markdown,
    finalizationArchiveStatusPath: finalizationArchiveStatus.path,
    finalizationArchiveStatusJson: finalizationArchiveStatus.json,
    finalizationArchivePath: finalizationArchive.path,
    finalizationArchiveJson: finalizationArchive.json,
    reportPath: evidenceSet.report.path,
    reportMarkdown: evidenceSet.report.markdown,
    archivePath: evidenceSet.archive.path,
    archiveJson: evidenceSet.archive.json,
    statusPath: statusArtifact.path,
    statusJson: statusArtifact.json,
    summaryPath: params.summaryPath,
    summaryMarkdown,
    finalizationStatusPath: finalizationStatus.path,
    finalizationStatusJson: finalizationStatus.json,
    broadcastReceiptPath: params.broadcastReceiptPath,
    broadcastReceiptJson: params.broadcastReceiptJson,
    broadcastPackagePath: params.broadcastPackagePath,
    broadcastPackageJson: params.broadcastPackageJson,
    submitResultPath: params.submitResultPath,
    submitResultJson: params.submitResultJson,
    generatedAt: params.generatedAt,
  });
  const packageJson = `${JSON.stringify(packageManifest, null, 2)}\n`;
  const verification = verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackage({
    finalizationArchiveStatusSummaryPackagePath: params.finalizationArchiveStatusSummaryPackagePath,
    finalizationArchiveStatusSummaryPackageJson: packageJson,
    finalizationArchiveStatusSummaryPath: finalizationArchiveStatusSummary.path,
    finalizationArchiveStatusSummaryMarkdown: finalizationArchiveStatusSummary.markdown,
    finalizationArchiveStatusPath: finalizationArchiveStatus.path,
    finalizationArchiveStatusJson: finalizationArchiveStatus.json,
    finalizationArchivePath: finalizationArchive.path,
    finalizationArchiveJson: finalizationArchive.json,
    reportPath: evidenceSet.report.path,
    reportMarkdown: evidenceSet.report.markdown,
    archivePath: evidenceSet.archive.path,
    archiveJson: evidenceSet.archive.json,
    statusPath: statusArtifact.path,
    statusJson: statusArtifact.json,
    summaryPath: params.summaryPath,
    summaryMarkdown,
    finalizationStatusPath: finalizationStatus.path,
    finalizationStatusJson: finalizationStatus.json,
    broadcastReceiptPath: params.broadcastReceiptPath,
    broadcastReceiptJson: params.broadcastReceiptJson,
    broadcastPackagePath: params.broadcastPackagePath,
    broadcastPackageJson: params.broadcastPackageJson,
    submitResultPath: params.submitResultPath,
    submitResultJson: params.submitResultJson,
  });

  return {
    artifact: {
      path: params.finalizationArchiveStatusSummaryPackagePath,
      json: packageJson,
    },
    verification,
  };
}

function createFinalizationArchiveStatusSummaryPackageStatus(
  params: CreateAgentProposalExecutionBroadcastCloseoutFinalizationParams,
  evidenceSet: AgentProposalExecutionBroadcastCloseoutEvidenceSet,
  statusArtifact: NonNullable<AgentProposalExecutionBroadcastCloseoutEvidenceSet["status"]>,
  summaryMarkdown: string,
  finalizationStatus: NonNullable<AgentProposalExecutionBroadcastCloseoutFinalization["finalizationStatus"]>,
  finalizationArchive: NonNullable<AgentProposalExecutionBroadcastCloseoutFinalization["finalizationArchive"]>,
  finalizationArchiveStatus: NonNullable<AgentProposalExecutionBroadcastCloseoutFinalization["finalizationArchiveStatus"]>,
  finalizationArchiveStatusSummary: NonNullable<
    AgentProposalExecutionBroadcastCloseoutFinalization["finalizationArchiveStatusSummary"]
  >,
  finalizationArchiveStatusSummaryPackage: NonNullable<
    AgentProposalExecutionBroadcastCloseoutFinalization["finalizationArchiveStatusSummaryPackage"]
  >,
): {
  artifact: NonNullable<
    AgentProposalExecutionBroadcastCloseoutFinalization["finalizationArchiveStatusSummaryPackageStatus"]
  >;
  verification: ReturnType<
    typeof verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatus
  >;
} {
  if (params.finalizationArchiveStatusSummaryPackageStatusPath === undefined) {
    throw new Error("finalizationArchiveStatusSummaryPackageStatusPath is required");
  }

  const status = createAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatus({
    finalizationArchiveStatusSummaryPackagePath: finalizationArchiveStatusSummaryPackage.path,
    finalizationArchiveStatusSummaryPackageJson: finalizationArchiveStatusSummaryPackage.json,
    finalizationArchiveStatusSummaryPath: finalizationArchiveStatusSummary.path,
    finalizationArchiveStatusSummaryMarkdown: finalizationArchiveStatusSummary.markdown,
    finalizationArchiveStatusPath: finalizationArchiveStatus.path,
    finalizationArchiveStatusJson: finalizationArchiveStatus.json,
    finalizationArchivePath: finalizationArchive.path,
    finalizationArchiveJson: finalizationArchive.json,
    reportPath: evidenceSet.report.path,
    reportMarkdown: evidenceSet.report.markdown,
    archivePath: evidenceSet.archive.path,
    archiveJson: evidenceSet.archive.json,
    statusPath: statusArtifact.path,
    statusJson: statusArtifact.json,
    summaryPath: params.summaryPath,
    summaryMarkdown,
    finalizationStatusPath: finalizationStatus.path,
    finalizationStatusJson: finalizationStatus.json,
    broadcastReceiptPath: params.broadcastReceiptPath,
    broadcastReceiptJson: params.broadcastReceiptJson,
    broadcastPackagePath: params.broadcastPackagePath,
    broadcastPackageJson: params.broadcastPackageJson,
    submitResultPath: params.submitResultPath,
    submitResultJson: params.submitResultJson,
  });
  const statusJson = formatAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatus(
    status,
  );
  const verification = verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatus({
    finalizationArchiveStatusSummaryPackageStatusJson: statusJson,
    finalizationArchiveStatusSummaryPackagePath: finalizationArchiveStatusSummaryPackage.path,
    finalizationArchiveStatusSummaryPackageJson: finalizationArchiveStatusSummaryPackage.json,
    finalizationArchiveStatusSummaryPath: finalizationArchiveStatusSummary.path,
    finalizationArchiveStatusSummaryMarkdown: finalizationArchiveStatusSummary.markdown,
    finalizationArchiveStatusPath: finalizationArchiveStatus.path,
    finalizationArchiveStatusJson: finalizationArchiveStatus.json,
    finalizationArchivePath: finalizationArchive.path,
    finalizationArchiveJson: finalizationArchive.json,
    reportPath: evidenceSet.report.path,
    reportMarkdown: evidenceSet.report.markdown,
    archivePath: evidenceSet.archive.path,
    archiveJson: evidenceSet.archive.json,
    statusPath: statusArtifact.path,
    statusJson: statusArtifact.json,
    summaryPath: params.summaryPath,
    summaryMarkdown,
    finalizationStatusPath: finalizationStatus.path,
    finalizationStatusJson: finalizationStatus.json,
    broadcastReceiptPath: params.broadcastReceiptPath,
    broadcastReceiptJson: params.broadcastReceiptJson,
    broadcastPackagePath: params.broadcastPackagePath,
    broadcastPackageJson: params.broadcastPackageJson,
    submitResultPath: params.submitResultPath,
    submitResultJson: params.submitResultJson,
  });

  return {
    artifact: {
      path: params.finalizationArchiveStatusSummaryPackageStatusPath,
      json: statusJson,
    },
    verification,
  };
}

function failedFinalization(
  summaryPath: string,
  evidenceSet: AgentProposalExecutionBroadcastCloseoutEvidenceSet,
  failures: string[],
): AgentProposalExecutionBroadcastCloseoutFinalization {
  return {
    passed: false,
    failures,
    report: evidenceSet.report,
    archive: evidenceSet.archive,
    status: null,
    summary: {
      path: summaryPath,
      markdown: "",
    },
    finalizationStatus: null,
    finalizationArchive: null,
    finalizationArchiveStatus: null,
    finalizationArchiveStatusSummary: null,
    finalizationArchiveStatusSummaryPackage: null,
    finalizationArchiveStatusSummaryPackageStatus: null,
    verification: {
      passed: false,
      failures,
      expected: "",
    },
  };
}
