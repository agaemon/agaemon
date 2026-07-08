import { createHash } from "node:crypto";

import { BASE_READINESS_SCRIPTS } from "../base/readiness.js";

export interface VerifyBaseSepoliaReleaseNoteParams {
  manifestContents?: string | undefined;
}

export interface BaseSepoliaReleaseNoteVerification {
  passed: boolean;
  failures: string[];
}

export function verifyBaseSepoliaReleaseNote(
  markdown: string,
  params: VerifyBaseSepoliaReleaseNoteParams = {},
): BaseSepoliaReleaseNoteVerification {
  const failures: string[] = [];
  const lines = markdown.split(/\r?\n/);

  if (lines[0]?.trim() !== "# Base Sepolia Rollout Checkpoint") {
    failures.push("release note title is invalid");
  }

  const evidenceTable = parseTableAfterHeading(lines, "## Evidence");
  const readinessTable = parseTableAfterHeading(lines, "## Readiness Checks");
  const evidence = new Map<string, string>();

  if (evidenceTable === undefined) {
    failures.push("evidence table is required");
  } else {
    for (const row of evidenceTable) {
      if (row.length >= 2) evidence.set(row[0]!, row[1]!);
    }
  }

  const generatedAt = readEvidenceValue(evidence, "Generated At", failures);
  if (generatedAt !== undefined && Number.isNaN(Date.parse(generatedAt))) {
    failures.push("generated timestamp is invalid");
  }

  const commitSha = stripInlineCode(readEvidenceValue(evidence, "Commit", failures));
  if (commitSha !== undefined && !isHexString(commitSha, 20)) {
    failures.push("commit sha must be 40 hex characters");
  }

  readEvidenceValue(evidence, "Manifest", failures);
  const manifestSha256 = stripInlineCode(readEvidenceValue(evidence, "Manifest SHA-256", failures));
  if (manifestSha256 !== undefined && !isHexString(manifestSha256, 32)) {
    failures.push("manifest sha256 must be 64 hex characters");
  } else if (manifestSha256 !== undefined && params.manifestContents !== undefined) {
    const currentHash = createHash("sha256").update(params.manifestContents).digest("hex");
    if (manifestSha256 !== currentHash) failures.push("manifest sha256 does not match current manifest");
  }

  const network = stripInlineCode(readEvidenceValue(evidence, "Network", failures));
  if (network !== undefined && network !== "base-sepolia") failures.push("network must be base-sepolia");

  const chainId = stripInlineCode(readEvidenceValue(evidence, "Chain ID", failures));
  if (chainId !== undefined && chainId !== "84532") failures.push("chain ID must be 84532");

  const readinessRunUrl = readEvidenceValue(evidence, "Readiness Run", failures);
  if (readinessRunUrl !== undefined && !isGitHubActionsRunUrl(readinessRunUrl)) {
    failures.push("readiness run URL is invalid");
  }

  const overall = stripInlineCode(readEvidenceValue(evidence, "Overall", failures));
  if (overall !== undefined && overall !== "passed") failures.push("overall status must be passed");

  const checksSummary = readEvidenceValue(evidence, "Checks", failures);
  const expectedSummary = `${BASE_READINESS_SCRIPTS.length} passed, 0 failed`;
  if (checksSummary !== undefined && checksSummary !== expectedSummary) {
    failures.push(`readiness checks summary must be "${expectedSummary}"`);
  }

  verifyReadinessRows(readinessTable, failures);

  return {
    passed: failures.length === 0,
    failures,
  };
}

export function formatBaseSepoliaReleaseNoteVerificationSummary(
  verification: BaseSepoliaReleaseNoteVerification,
): string {
  return [
    "Base Sepolia release note verification",
    `passed: ${verification.passed}`,
    `failures: ${verification.failures.length}`,
    ...verification.failures.map((failure) => `- ${failure}`),
  ].join("\n");
}

function verifyReadinessRows(rows: string[][] | undefined, failures: string[]): void {
  if (rows === undefined) {
    failures.push("readiness checks table is required");
    return;
  }

  if (rows.length !== BASE_READINESS_SCRIPTS.length) {
    failures.push(`readiness checks table must contain ${BASE_READINESS_SCRIPTS.length} rows`);
  }

  for (let index = 0; index < BASE_READINESS_SCRIPTS.length; index += 1) {
    const expected = BASE_READINESS_SCRIPTS[index]!;
    const row = rows[index];
    if (row === undefined) {
      failures.push(`readiness check ${expected.name} row is required`);
      continue;
    }

    const name = row[0];
    const status = row[1];
    const script = stripInlineCode(row[2]);

    if (name !== expected.name) failures.push(`readiness check ${index} name mismatch`);
    if (status !== "passed") failures.push(`readiness check ${expected.name} status must be passed`);
    if (script !== expected.script) failures.push(`readiness check ${expected.name} script mismatch`);
  }
}

function parseTableAfterHeading(lines: string[], heading: string): string[][] | undefined {
  const headingIndex = lines.findIndex((line) => line.trim() === heading);
  if (headingIndex === -1) return undefined;

  const tableRows: string[][] = [];
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (line.length === 0) {
      if (tableRows.length === 0) continue;
      break;
    }
    if (!line.startsWith("|")) {
      if (tableRows.length === 0) continue;
      break;
    }
    tableRows.push(splitMarkdownTableRow(line));
  }

  if (tableRows.length < 2) return undefined;
  return tableRows.slice(2);
}

function splitMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim();
  const withoutLeadingPipe = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
  const withoutTrailingPipe = withoutLeadingPipe.endsWith("|") ? withoutLeadingPipe.slice(0, -1) : withoutLeadingPipe;
  return withoutTrailingPipe.split("|").map((column) => column.trim());
}

function readEvidenceValue(evidence: Map<string, string>, field: string, failures: string[]): string | undefined {
  const value = evidence.get(field);
  if (value === undefined || value.length === 0) {
    failures.push(`${field} evidence is required`);
    return undefined;
  }
  return value;
}

function stripInlineCode(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const match = value.match(/^`([^`]+)`$/);
  return match?.[1] ?? value;
}

function isHexString(value: string, byteLength: number): boolean {
  return new RegExp(`^[0-9a-fA-F]{${byteLength * 2}}$`).test(value);
}

function isGitHubActionsRunUrl(value: string): boolean {
  return /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/actions\/runs\/\d+$/.test(value);
}
