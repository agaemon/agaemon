import { verifyBaseSepoliaReleaseNote } from "./noteVerifier.js";

export interface BaseSepoliaReleaseNoteSource {
  path: string;
  markdown: string;
}

export interface CreateBaseSepoliaReleaseIndexParams {
  manifestContents?: string | undefined;
}

export interface BaseSepoliaReleaseIndexVerification {
  passed: boolean;
  failures: string[];
  expected: string;
}

export interface BaseSepoliaReleaseIndexEntry {
  path: string;
  generatedAt: string;
  commitSha: string;
  manifestSha256: string;
  readinessRunUrl: string;
  checksSummary: string;
}

export interface BaseSepoliaReleaseIndexWriteReport {
  output: string;
  notes: number;
  manifest?: string | undefined;
  written: boolean;
}

export interface BaseSepoliaReleaseIndexCheckReport {
  output: string;
  notes: number;
  manifest?: string | undefined;
  passed: boolean;
  failures: string[];
}

export type BaseSepoliaReleaseIndexReport =
  | BaseSepoliaReleaseIndexWriteReport
  | BaseSepoliaReleaseIndexCheckReport;

export function isBaseSepoliaReleaseNoteFilename(filename: string): boolean {
  return /^base-sepolia-\d{4}-\d{2}-\d{2}-[0-9a-f]{7}\.md$/i.test(filename);
}

export function createBaseSepoliaReleaseEntries(
  notes: readonly BaseSepoliaReleaseNoteSource[],
  params: CreateBaseSepoliaReleaseIndexParams = {},
): BaseSepoliaReleaseIndexEntry[] {
  const entries = notes.map((note) => parseReleaseIndexEntry(note, params));
  entries.sort((left, right) => {
    const dateSort = Date.parse(right.generatedAt) - Date.parse(left.generatedAt);
    if (dateSort !== 0) return dateSort;
    return left.path.localeCompare(right.path);
  });
  return entries;
}

export function createBaseSepoliaReleaseIndex(
  notes: readonly BaseSepoliaReleaseNoteSource[],
  params: CreateBaseSepoliaReleaseIndexParams = {},
): string {
  const entries = createBaseSepoliaReleaseEntries(notes, params);

  return [
    "# Base Sepolia Release Index",
    "",
    "Generated from verified rollout notes. Individual release notes remain the source of truth.",
    "",
    "| Generated At | Commit | Readiness Run | Checks | Manifest SHA-256 | Note |",
    "| --- | --- | --- | --- | --- | --- |",
    ...entries.map(formatReleaseIndexRow),
    "",
  ].join("\n");
}

export function verifyBaseSepoliaReleaseIndex(
  markdown: string,
  notes: readonly BaseSepoliaReleaseNoteSource[],
  params: CreateBaseSepoliaReleaseIndexParams = {},
): BaseSepoliaReleaseIndexVerification {
  try {
    const expected = createBaseSepoliaReleaseIndex(notes, params);
    const failures = markdown === expected ? [] : ["release index is stale"];
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

export function formatBaseSepoliaReleaseIndexSummary(report: BaseSepoliaReleaseIndexReport): string {
  return [
    "Base Sepolia release index",
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

function parseReleaseIndexEntry(
  note: BaseSepoliaReleaseNoteSource,
  params: CreateBaseSepoliaReleaseIndexParams,
): BaseSepoliaReleaseIndexEntry {
  const verification = verifyBaseSepoliaReleaseNote(note.markdown, {
    manifestContents: params.manifestContents,
  });
  if (!verification.passed) {
    throw new Error(`release note ${note.path} failed verification: ${verification.failures.join("; ")}`);
  }

  const evidence = parseEvidence(note.markdown);
  return {
    path: note.path,
    generatedAt: readEvidence(evidence, "Generated At", note.path),
    commitSha: stripInlineCode(readEvidence(evidence, "Commit", note.path)),
    manifestSha256: stripInlineCode(readEvidence(evidence, "Manifest SHA-256", note.path)),
    readinessRunUrl: readEvidence(evidence, "Readiness Run", note.path),
    checksSummary: readEvidence(evidence, "Checks", note.path),
  };
}

function formatReleaseIndexRow(entry: BaseSepoliaReleaseIndexEntry): string {
  const runId = entry.readinessRunUrl.split("/").at(-1) ?? entry.readinessRunUrl;
  return [
    entry.generatedAt,
    `\`${entry.commitSha.slice(0, 7)}\``,
    `[${runId}](${entry.readinessRunUrl})`,
    entry.checksSummary,
    `\`${entry.manifestSha256}\``,
    `[${entry.path}](${entry.path})`,
  ].join(" | ").replace(/^/, "| ").replace(/$/, " |");
}

function parseEvidence(markdown: string): Map<string, string> {
  const lines = markdown.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.trim() === "## Evidence");
  const evidence = new Map<string, string>();
  if (headingIndex === -1) return evidence;

  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (line.length === 0) {
      if (evidence.size === 0) continue;
      break;
    }
    if (!line.startsWith("|")) {
      if (evidence.size === 0) continue;
      break;
    }

    const row = splitMarkdownTableRow(line);
    if (row[0] === "---" || row[0] === "Field") continue;
    if (row.length >= 2) evidence.set(row[0]!, row[1]!);
  }

  return evidence;
}

function splitMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim();
  const withoutLeadingPipe = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
  const withoutTrailingPipe = withoutLeadingPipe.endsWith("|") ? withoutLeadingPipe.slice(0, -1) : withoutLeadingPipe;
  return withoutTrailingPipe.split("|").map((column) => column.trim());
}

function readEvidence(evidence: Map<string, string>, field: string, path: string): string {
  const value = evidence.get(field);
  if (value === undefined || value.length === 0) {
    throw new Error(`release note ${path} missing ${field} evidence`);
  }
  return value;
}

function stripInlineCode(value: string): string {
  const match = value.match(/^`([^`]+)`$/);
  return match?.[1] ?? value;
}
