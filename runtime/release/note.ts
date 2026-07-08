import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { verifyReadinessCheckpoint } from "../base/checkpoint.js";

import type { ReadinessCheckpoint } from "../base/checkpoint.js";

export interface CreateBaseSepoliaReleaseNoteParams {
  manifestContents?: string | undefined;
  requireRunUrl?: boolean | undefined;
}

export interface BaseSepoliaReleaseNoteCreationReport {
  checkpoint: string;
  manifest?: string | undefined;
  output: string;
  requireRunUrl: boolean;
  written: boolean;
}

export function defaultBaseSepoliaReleaseNotePath(checkpoint: ReadinessCheckpoint): string {
  const date = checkpoint.generatedAt.slice(0, 10);
  const shortSha = checkpoint.commit.sha.slice(0, 7);
  return `docs/releases/base-sepolia-${date}-${shortSha}.md`;
}

export function createBaseSepoliaReleaseNote(
  checkpoint: unknown,
  params: CreateBaseSepoliaReleaseNoteParams = {},
): string {
  const requireRunUrl = params.requireRunUrl ?? true;
  const verification = verifyReadinessCheckpoint(checkpoint, {
    manifestContents: params.manifestContents,
    requireRunUrl,
  });
  if (!verification.passed) {
    throw new Error(`Invalid readiness checkpoint: ${verification.failures.join("; ")}`);
  }

  const verifiedCheckpoint = checkpoint as ReadinessCheckpoint;
  if (typeof verifiedCheckpoint.generatedAt !== "string" || verifiedCheckpoint.generatedAt.length === 0) {
    throw new Error("checkpoint generatedAt is required");
  }

  const readinessRunUrl = verifiedCheckpoint.readiness.runUrl ?? "not recorded";
  const checks = verifiedCheckpoint.readiness.checks
    .map((check) => `| ${escapeTableValue(check.name)} | passed | \`${escapeTableValue(check.script)}\` |`)
    .join("\n");

  return [
    "# Base Sepolia Rollout Checkpoint",
    "",
    "## Evidence",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Generated At | ${verifiedCheckpoint.generatedAt} |`,
    `| Commit | \`${verifiedCheckpoint.commit.sha}\` |`,
    `| Manifest | \`${verifiedCheckpoint.manifest.path}\` |`,
    `| Manifest SHA-256 | \`${verifiedCheckpoint.manifest.sha256}\` |`,
    `| Network | \`${verifiedCheckpoint.manifest.network}\` |`,
    `| Chain ID | \`${verifiedCheckpoint.manifest.chainId}\` |`,
    `| Readiness Run | ${readinessRunUrl} |`,
    `| Overall | \`${verifiedCheckpoint.readiness.summary.overall}\` |`,
    `| Checks | ${verifiedCheckpoint.readiness.summary.passed} passed, ${verifiedCheckpoint.readiness.summary.failed} failed |`,
    "",
    "## Readiness Checks",
    "",
    "| Check | Status | Script |",
    "| --- | --- | --- |",
    checks,
    "",
  ].join("\n");
}

export async function writeBaseSepoliaReleaseNote(path: string, markdown: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, markdown);
}

export function formatBaseSepoliaReleaseNoteCreationSummary(report: BaseSepoliaReleaseNoteCreationReport): string {
  return [
    "Base Sepolia release note",
    `checkpoint: ${report.checkpoint}`,
    ...(report.manifest === undefined ? [] : [`manifest: ${report.manifest}`]),
    `output: ${report.output}`,
    `requireRunUrl: ${report.requireRunUrl}`,
    `written: ${report.written}`,
  ].join("\n");
}

function escapeTableValue(value: string): string {
  return value.replace(/\|/g, "\\|");
}
