import { createBaseSepoliaReleaseEntries } from "./index.js";

import type { BaseSepoliaReleaseNoteSource, CreateBaseSepoliaReleaseIndexParams } from "./index.js";

export interface BaseSepoliaReleaseStatusVerification {
  passed: boolean;
  failures: string[];
  expected: string;
}

export interface BaseSepoliaReleaseStatusSnapshotVerification {
  passed: boolean;
  failures: string[];
}

export interface BaseSepoliaReleaseStatusWriteReport {
  output: string;
  notes: number;
  manifest?: string | undefined;
  written: boolean;
}

export interface BaseSepoliaReleaseStatusCheckReport {
  output: string;
  notes: number;
  manifest?: string | undefined;
  passed: boolean;
  failures: string[];
}

export type BaseSepoliaReleaseStatusReport =
  | BaseSepoliaReleaseStatusWriteReport
  | BaseSepoliaReleaseStatusCheckReport;

export function createBaseSepoliaReleaseStatus(
  notes: readonly BaseSepoliaReleaseNoteSource[],
  params: CreateBaseSepoliaReleaseIndexParams = {},
): string {
  const entries = createBaseSepoliaReleaseEntries(notes, params);
  const latest = entries[0];
  const status = {
    schemaVersion: 1,
    network: "base-sepolia",
    releaseCount: entries.length,
    latest:
      latest === undefined
        ? null
        : {
            note: latest.path,
            generatedAt: latest.generatedAt,
            commitSha: latest.commitSha,
            shortCommitSha: latest.commitSha.slice(0, 7),
            manifestSha256: latest.manifestSha256,
            readinessRunUrl: latest.readinessRunUrl,
            readinessRunId: latest.readinessRunUrl.split("/").at(-1) ?? latest.readinessRunUrl,
            checksSummary: latest.checksSummary,
          },
    releases: entries.map((entry) => ({
      note: entry.path,
      generatedAt: entry.generatedAt,
      commitSha: entry.commitSha,
      readinessRunUrl: entry.readinessRunUrl,
    })),
  };

  return `${JSON.stringify(status, null, 2)}\n`;
}

export function verifyBaseSepoliaReleaseStatus(
  json: string,
  notes: readonly BaseSepoliaReleaseNoteSource[],
  params: CreateBaseSepoliaReleaseIndexParams = {},
): BaseSepoliaReleaseStatusVerification {
  try {
    const expected = createBaseSepoliaReleaseStatus(notes, params);
    const failures = json === expected ? [] : ["release status is stale"];
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

export function formatBaseSepoliaReleaseStatusSummary(report: BaseSepoliaReleaseStatusReport): string {
  return [
    "Base Sepolia release status",
    `output: ${report.output}`,
    `notes: ${report.notes}`,
    ...(report.manifest === undefined ? [] : [`manifest: ${report.manifest}`]),
    ...("written" in report
      ? [`written: ${report.written}`]
      : [
          `passed: ${report.passed}`,
          `failures: ${report.failures.length}`,
          ...report.failures.map((failure) => `- ${failure}`),
        ]),
  ].join("\n");
}

export function formatBaseSepoliaReleaseStatusSnapshotVerificationSummary(
  verification: BaseSepoliaReleaseStatusSnapshotVerification,
): string {
  return [
    "Base Sepolia release status verification",
    `passed: ${verification.passed}`,
    `failures: ${verification.failures.length}`,
    ...verification.failures.map((failure) => `- ${failure}`),
  ].join("\n");
}

export function verifyBaseSepoliaReleaseStatusSnapshot(
  json: string,
): BaseSepoliaReleaseStatusSnapshotVerification {
  let snapshot: unknown;
  try {
    snapshot = JSON.parse(json);
  } catch (error) {
    return {
      passed: false,
      failures: [`status JSON is malformed: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  const failures: string[] = [];
  if (!isRecord(snapshot)) {
    return {
      passed: false,
      failures: ["status must be a JSON object"],
    };
  }

  if (snapshot.schemaVersion !== 1) failures.push("schemaVersion must be 1");
  if (snapshot.network !== "base-sepolia") failures.push("network must be base-sepolia");
  if (!Number.isInteger(snapshot.releaseCount) || Number(snapshot.releaseCount) < 0) {
    failures.push("releaseCount must be a non-negative integer");
  }

  const releases = Array.isArray(snapshot.releases) ? snapshot.releases : undefined;
  if (releases === undefined) {
    failures.push("releases must be an array");
  } else if (Number.isInteger(snapshot.releaseCount) && snapshot.releaseCount !== releases.length) {
    failures.push("releaseCount must equal releases length");
  }

  const latest = snapshot.latest;
  if (releases?.length === 0) {
    if (latest !== null) failures.push("latest must be null when releases is empty");
  } else {
    if (!isRecord(latest)) {
      failures.push("latest must be an object when releases is not empty");
    } else {
      validateLatestRelease(latest, failures);
      const firstRelease = releases?.[0];
      if (isRecord(firstRelease)) validateLatestMatchesRelease(latest, firstRelease, failures);
    }
  }

  releases?.forEach((release, index) => {
    if (!isRecord(release)) {
      failures.push(`releases[${index}] must be an object`);
      return;
    }
    validateReleaseSummary(release, `releases[${index}]`, failures);
  });

  return {
    passed: failures.length === 0,
    failures,
  };
}

function validateLatestRelease(latest: Record<string, unknown>, failures: string[]): void {
  validateReleaseSummary(latest, "latest", failures);
  if (!isSha256(latest.manifestSha256)) failures.push("latest.manifestSha256 must be a SHA-256 hex string");
  if (typeof latest.shortCommitSha !== "string" || latest.shortCommitSha !== String(latest.commitSha).slice(0, 7)) {
    failures.push("latest.shortCommitSha must match the first 7 characters of latest.commitSha");
  }
  if (typeof latest.readinessRunId !== "string" || latest.readinessRunId !== String(latest.readinessRunUrl).split("/").at(-1)) {
    failures.push("latest.readinessRunId must match latest.readinessRunUrl");
  }
  if (typeof latest.checksSummary !== "string" || !/^\d+ passed, \d+ failed$/.test(latest.checksSummary)) {
    failures.push("latest.checksSummary must summarize passed and failed checks");
  }
}

function validateReleaseSummary(
  release: Record<string, unknown>,
  prefix: "latest" | `releases[${number}]`,
  failures: string[],
): void {
  if (typeof release.note !== "string" || !/^base-sepolia-.+\.md$/.test(release.note)) {
    failures.push(`${prefix}.note must name a Base Sepolia release note`);
  }
  if (typeof release.generatedAt !== "string" || Number.isNaN(Date.parse(release.generatedAt))) {
    failures.push(`${prefix}.generatedAt must be a valid timestamp`);
  }
  if (!isCommitSha(release.commitSha)) failures.push(`${prefix}.commitSha must be a 40-character hex string`);
  if (!isGitHubActionsRunUrl(release.readinessRunUrl)) {
    failures.push(`${prefix}.readinessRunUrl must be a GitHub Actions run URL`);
  }
}

function validateLatestMatchesRelease(
  latest: Record<string, unknown>,
  release: Record<string, unknown>,
  failures: string[],
): void {
  if (latest.note !== release.note) failures.push("latest.note must match releases[0].note");
  if (latest.generatedAt !== release.generatedAt) failures.push("latest.generatedAt must match releases[0].generatedAt");
  if (latest.commitSha !== release.commitSha) failures.push("latest.commitSha must match releases[0].commitSha");
  if (latest.readinessRunUrl !== release.readinessRunUrl) {
    failures.push("latest.readinessRunUrl must match releases[0].readinessRunUrl");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCommitSha(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
}

function isGitHubActionsRunUrl(value: unknown): value is string {
  return typeof value === "string" && /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/actions\/runs\/\d+$/.test(value);
}
