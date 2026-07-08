import { verifyBaseSepoliaEnvExample } from "../env/exampleVerifier.js";
import { verifyBaseSepoliaReleaseIndex } from "../release/index.js";
import { verifyBaseSepoliaReleaseNote } from "../release/noteVerifier.js";
import {
  verifyBaseSepoliaReleaseStatus,
  verifyBaseSepoliaReleaseStatusSnapshot,
} from "../release/status.js";
import { verifyBaseSepoliaReleaseSummary } from "../release/summary.js";

import type { BaseSepoliaReleaseNoteSource, CreateBaseSepoliaReleaseIndexParams } from "../release/index.js";

export interface BaseSepoliaLocalPreflightInput {
  envExampleContents: string;
  releaseNotes: readonly BaseSepoliaReleaseNoteSource[];
  releaseIndexMarkdown: string;
  releaseStatusJson: string;
  releaseSummaryMarkdown: string;
  manifestContents?: string | undefined;
}

export interface BaseSepoliaLocalPreflightCheck {
  name: string;
  passed: boolean;
  failures: string[];
}

export interface BaseSepoliaLocalPreflightReport {
  passed: boolean;
  checks: BaseSepoliaLocalPreflightCheck[];
}

export function verifyBaseSepoliaLocalPreflight(
  input: BaseSepoliaLocalPreflightInput,
): BaseSepoliaLocalPreflightReport {
  const params: CreateBaseSepoliaReleaseIndexParams = {
    manifestContents: input.manifestContents,
  };
  const checks = [
    checkEnvExample(input.envExampleContents),
    checkReleaseNotes(input.releaseNotes, params),
    checkReleaseIndex(input.releaseIndexMarkdown, input.releaseNotes, params),
    checkReleaseStatus(input.releaseStatusJson, input.releaseNotes, params),
    checkReleaseStatusSnapshot(input.releaseStatusJson),
    checkReleaseSummary(input.releaseSummaryMarkdown, input.releaseStatusJson),
  ];

  return {
    passed: checks.every((check) => check.passed),
    checks,
  };
}

export function formatBaseSepoliaLocalPreflightSummary(
  report: BaseSepoliaLocalPreflightReport,
): string {
  const passed = report.checks.filter((check) => check.passed).length;
  const failed = report.checks.length - passed;

  return [
    "Base Sepolia local preflight",
    `checks: ${report.checks.length}`,
    `passed: ${passed}`,
    `failed: ${failed}`,
    `overall: ${report.passed ? "passed" : "failed"}`,
    ...report.checks.map(formatCheckSummary),
  ].join("\n");
}

function checkEnvExample(contents: string): BaseSepoliaLocalPreflightCheck {
  const verification = verifyBaseSepoliaEnvExample(contents);
  return {
    name: "env-example",
    passed: verification.passed,
    failures: verification.failures,
  };
}

function checkReleaseNotes(
  notes: readonly BaseSepoliaReleaseNoteSource[],
  params: CreateBaseSepoliaReleaseIndexParams,
): BaseSepoliaLocalPreflightCheck {
  const failures = notes.flatMap((note) => {
    const verification = verifyBaseSepoliaReleaseNote(note.markdown, {
      manifestContents: params.manifestContents,
    });
    return verification.failures.map((failure) => `release note ${note.path}: ${failure}`);
  });

  return {
    name: "release-notes",
    passed: failures.length === 0,
    failures,
  };
}

function checkReleaseIndex(
  markdown: string,
  notes: readonly BaseSepoliaReleaseNoteSource[],
  params: CreateBaseSepoliaReleaseIndexParams,
): BaseSepoliaLocalPreflightCheck {
  const verification = verifyBaseSepoliaReleaseIndex(markdown, notes, params);
  return {
    name: "release-index",
    passed: verification.passed,
    failures: verification.failures,
  };
}

function checkReleaseStatus(
  json: string,
  notes: readonly BaseSepoliaReleaseNoteSource[],
  params: CreateBaseSepoliaReleaseIndexParams,
): BaseSepoliaLocalPreflightCheck {
  const verification = verifyBaseSepoliaReleaseStatus(json, notes, params);
  return {
    name: "release-status",
    passed: verification.passed,
    failures: verification.failures,
  };
}

function checkReleaseStatusSnapshot(json: string): BaseSepoliaLocalPreflightCheck {
  const verification = verifyBaseSepoliaReleaseStatusSnapshot(json);
  return {
    name: "release-status-schema",
    passed: verification.passed,
    failures: verification.failures,
  };
}

function checkReleaseSummary(markdown: string, statusJson: string): BaseSepoliaLocalPreflightCheck {
  const verification = verifyBaseSepoliaReleaseSummary(markdown, statusJson);
  return {
    name: "release-summary",
    passed: verification.passed,
    failures: verification.failures,
  };
}

function formatCheckSummary(check: BaseSepoliaLocalPreflightCheck): string {
  const failure = check.passed ? "" : ` (${check.failures.join("; ") || "no failure details"})`;
  return `- ${check.name}: ${check.passed ? "passed" : "failed"}${failure}`;
}
