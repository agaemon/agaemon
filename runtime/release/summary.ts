import { verifyBaseSepoliaReleaseStatusSnapshot } from "./status.js";

export interface BaseSepoliaReleaseSummaryVerification {
  passed: boolean;
  failures: string[];
  expected: string;
}

export interface BaseSepoliaReleaseSummaryWriteReport {
  status: string;
  output: string;
  written: boolean;
}

export interface BaseSepoliaReleaseSummaryCheckReport {
  status: string;
  output: string;
  passed: boolean;
  failures: string[];
}

export type BaseSepoliaReleaseSummaryReport =
  | BaseSepoliaReleaseSummaryWriteReport
  | BaseSepoliaReleaseSummaryCheckReport;

interface BaseSepoliaReleaseStatusSnapshot {
  releaseCount: number;
  latest: BaseSepoliaLatestRelease | null;
}

interface BaseSepoliaLatestRelease {
  note: string;
  generatedAt: string;
  commitSha: string;
  manifestSha256: string;
  readinessRunUrl: string;
  readinessRunId: string;
  checksSummary: string;
}

export function createBaseSepoliaReleaseSummary(statusJson: string): string {
  const verification = verifyBaseSepoliaReleaseStatusSnapshot(statusJson);
  if (!verification.passed) {
    throw new Error(`release status snapshot invalid: ${verification.failures.join("; ")}`);
  }

  const status = JSON.parse(statusJson) as BaseSepoliaReleaseStatusSnapshot;
  const header = [
    "# Current Base Sepolia Release",
    "",
    "Generated from `docs/releases/latest.json`. Individual release notes remain the source of truth.",
    "",
  ];

  if (status.latest === null) {
    return [
      ...header,
      "No Base Sepolia release notes have been published yet.",
      "",
      "| Field | Value |",
      "| --- | --- |",
      "| Status | `unavailable` |",
      `| Release Count | ${status.releaseCount} |`,
      "",
    ].join("\n");
  }

  const latest = status.latest;
  return [
    ...header,
    "| Field | Value |",
    "| --- | --- |",
    "| Status | `available` |",
    `| Latest Note | [${latest.note}](${latest.note}) |`,
    `| Generated At | ${latest.generatedAt} |`,
    `| Commit | \`${latest.commitSha}\` |`,
    `| Readiness Run | [${latest.readinessRunId}](${latest.readinessRunUrl}) |`,
    `| Checks | ${latest.checksSummary} |`,
    `| Manifest SHA-256 | \`${latest.manifestSha256}\` |`,
    `| Release Count | ${status.releaseCount} |`,
    "",
  ].join("\n");
}

export function verifyBaseSepoliaReleaseSummary(
  markdown: string,
  statusJson: string,
): BaseSepoliaReleaseSummaryVerification {
  try {
    const expected = createBaseSepoliaReleaseSummary(statusJson);
    const failures = markdown === expected ? [] : ["release summary is stale"];
    return {
      passed: failures.length === 0,
      failures,
      expected,
    };
  } catch (error) {
    return {
      passed: false,
      failures: [error instanceof Error ? error.message : String(error)],
      expected: "",
    };
  }
}

export function formatBaseSepoliaReleaseSummaryReport(report: BaseSepoliaReleaseSummaryReport): string {
  return [
    "Base Sepolia release summary",
    `status: ${report.status}`,
    `output: ${report.output}`,
    ...("written" in report
      ? [`written: ${report.written}`]
      : [
          `passed: ${report.passed}`,
          `failures: ${report.failures.length}`,
          ...report.failures.map((failure) => `- ${failure}`),
        ]),
  ].join("\n");
}
