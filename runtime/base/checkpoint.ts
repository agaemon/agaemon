import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";

import {
  BASE_READINESS_SCRIPTS,
  buildBaseReadinessChecks,
  createChildProcessReadinessRunner,
  runBaseReadinessChecks,
} from "./readiness.js";
import { parseDeploymentManifest } from "./deploymentManifest.js";

import type { ReadinessCheckResult, ReadinessRunner } from "./readiness.js";

const execFileAsync = promisify(execFile);
const DEFAULT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";

export interface ReadinessCheckpoint {
  schemaVersion: 1;
  generatedAt: string;
  commit: {
    sha: string;
  };
  manifest: {
    path: string;
    sha256: string;
    network: string;
    chainId: number;
    deployedAt?: string | undefined;
  };
  readiness: {
    runUrl?: string | undefined;
    summary: {
      checks: number;
      passed: number;
      failed: number;
      overall: "passed" | "failed";
    };
    checks: ReadinessCheckpointCheck[];
  };
}

export interface ReadinessCheckpointCheck {
  name: string;
  script: string;
  command: string;
  passed: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

export interface CreateReadinessCheckpointParams {
  manifestPath?: string | undefined;
  commitSha?: string | undefined;
  generatedAt?: string | undefined;
  readinessRunUrl?: string | undefined;
  environment?: Record<string, string | undefined> | undefined;
  runner?: ReadinessRunner | undefined;
}

export interface VerifyReadinessCheckpointParams {
  manifestContents?: string | undefined;
  requireRunUrl?: boolean | undefined;
}

export interface ReadinessCheckpointVerification {
  passed: boolean;
  failures: string[];
}

export async function createReadinessCheckpoint(
  params: CreateReadinessCheckpointParams = {},
): Promise<ReadinessCheckpoint> {
  const manifestPath = params.manifestPath ?? DEFAULT_MANIFEST_PATH;
  const manifestContents = await readFile(manifestPath, "utf8");
  const manifest = parseDeploymentManifest(JSON.parse(manifestContents) as unknown);
  const checks = buildBaseReadinessChecks({ manifestPath });
  const results = await runBaseReadinessChecks(checks, params.runner ?? createChildProcessReadinessRunner());
  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;
  const readinessRunUrl = params.readinessRunUrl ?? deriveGitHubActionsRunUrl(params.environment ?? process.env);

  return {
    schemaVersion: 1,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    commit: {
      sha: params.commitSha ?? (await readGitCommitSha()),
    },
    manifest: {
      path: manifestPath,
      sha256: createHash("sha256").update(manifestContents).digest("hex"),
      network: manifest.network,
      chainId: manifest.chainId,
      ...(manifest.deployedAt === undefined ? {} : { deployedAt: manifest.deployedAt }),
    },
    readiness: {
      ...(readinessRunUrl === undefined ? {} : { runUrl: readinessRunUrl }),
      summary: {
        checks: results.length,
        passed,
        failed,
        overall: failed === 0 ? "passed" : "failed",
      },
      checks: results.map(formatCheckpointCheck),
    },
  };
}

export async function writeReadinessCheckpoint(path: string, checkpoint: ReadinessCheckpoint): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(checkpoint, null, 2)}\n`);
}

export async function readReadinessCheckpoint(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

export function formatReadinessCheckpointSummary(checkpoint: ReadinessCheckpoint): string {
  return [
    "Base Sepolia readiness checkpoint",
    `generatedAt: ${checkpoint.generatedAt}`,
    `commit: ${checkpoint.commit.sha}`,
    `manifest: ${checkpoint.manifest.path}`,
    `manifestSha256: ${checkpoint.manifest.sha256}`,
    `network: ${checkpoint.manifest.network}`,
    `chainId: ${checkpoint.manifest.chainId}`,
    `readinessRunUrl: ${checkpoint.readiness.runUrl ?? "not recorded"}`,
    `checks: ${checkpoint.readiness.summary.checks}`,
    `passed: ${checkpoint.readiness.summary.passed}`,
    `failed: ${checkpoint.readiness.summary.failed}`,
    `overall: ${checkpoint.readiness.summary.overall}`,
    ...checkpoint.readiness.checks.map((check) => `- ${check.name}: ${check.passed ? "passed" : "failed"}`),
  ].join("\n");
}

export function formatReadinessCheckpointVerificationSummary(
  verification: ReadinessCheckpointVerification,
): string {
  return [
    "Base Sepolia readiness checkpoint verification",
    `passed: ${verification.passed}`,
    `failures: ${verification.failures.length}`,
    ...verification.failures.map((failure) => `- ${failure}`),
  ].join("\n");
}

export function verifyReadinessCheckpoint(
  checkpoint: unknown,
  params: VerifyReadinessCheckpointParams = {},
): ReadinessCheckpointVerification {
  const failures: string[] = [];
  if (!isRecord(checkpoint)) {
    return { passed: false, failures: ["checkpoint must be an object"] };
  }

  if (checkpoint.schemaVersion !== 1) failures.push("unsupported checkpoint schemaVersion");
  verifyCommit(checkpoint.commit, failures);
  verifyManifest(checkpoint.manifest, params.manifestContents, failures);
  verifyReadiness(checkpoint.readiness, params.requireRunUrl === true, failures);

  return {
    passed: failures.length === 0,
    failures,
  };
}

export function deriveGitHubActionsRunUrl(
  environment: Record<string, string | undefined> = process.env,
): string | undefined {
  const serverUrl = environment.GITHUB_SERVER_URL;
  const repository = environment.GITHUB_REPOSITORY;
  const runId = environment.GITHUB_RUN_ID;
  if (serverUrl === undefined || repository === undefined || runId === undefined) return undefined;

  return `${serverUrl.replace(/\/+$/, "")}/${repository}/actions/runs/${runId}`;
}

export async function readGitCommitSha(): Promise<string> {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"]);
  return stdout.trim();
}

function formatCheckpointCheck(result: ReadinessCheckResult): ReadinessCheckpointCheck {
  return {
    name: result.name,
    script: result.script,
    command: [result.command, ...result.args].join(" "),
    passed: result.passed,
    exitCode: result.exitCode,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function verifyCommit(value: unknown, failures: string[]): void {
  if (!isRecord(value)) {
    failures.push("commit must be an object");
    return;
  }

  if (!isHexString(value.sha, 20)) failures.push("commit sha must be 40 hex characters");
}

function verifyManifest(value: unknown, manifestContents: string | undefined, failures: string[]): void {
  if (!isRecord(value)) {
    failures.push("manifest must be an object");
    return;
  }

  if (!isNonEmptyString(value.path)) failures.push("manifest path is required");
  if (!isHexString(value.sha256, 32)) {
    failures.push("manifest sha256 must be 64 hex characters");
  } else if (manifestContents !== undefined) {
    const currentHash = createHash("sha256").update(manifestContents).digest("hex");
    if (value.sha256 !== currentHash) failures.push("manifest sha256 does not match current manifest");
  }
  if (!isNonEmptyString(value.network)) failures.push("manifest network is required");
  if (!Number.isInteger(value.chainId)) failures.push("manifest chainId must be an integer");
}

function verifyReadiness(value: unknown, requireRunUrl: boolean, failures: string[]): void {
  if (!isRecord(value)) {
    failures.push("readiness must be an object");
    return;
  }

  if (requireRunUrl && !isNonEmptyString(value.runUrl)) failures.push("readiness run URL is required");
  const checks = Array.isArray(value.checks) ? value.checks : undefined;
  if (checks === undefined) {
    failures.push("readiness checks must be an array");
    return;
  }

  if (checks.length !== BASE_READINESS_SCRIPTS.length) {
    failures.push("readiness checks length does not match expected checks");
  }

  const passedCount = checks.filter((check) => isRecord(check) && check.passed === true).length;
  const failedCount = checks.length - passedCount;
  verifyReadinessSummary(value.summary, checks.length, passedCount, failedCount, failures);

  for (let index = 0; index < BASE_READINESS_SCRIPTS.length; index += 1) {
    const expected = BASE_READINESS_SCRIPTS[index]!;
    const check = checks[index];
    if (!isRecord(check)) {
      failures.push(`readiness check ${expected.name} must be an object`);
      continue;
    }

    if (check.name !== expected.name) failures.push(`readiness check ${index} name mismatch`);
    if (check.script !== expected.script) failures.push(`readiness check ${expected.name} script mismatch`);
    if (!isNonEmptyString(check.command)) failures.push(`readiness check ${expected.name} command is required`);
    if (check.passed !== true) failures.push(`readiness check ${expected.name} failed`);
  }
}

function verifyReadinessSummary(
  value: unknown,
  checkCount: number,
  passedCount: number,
  failedCount: number,
  failures: string[],
): void {
  if (!isRecord(value)) {
    failures.push("readiness summary must be an object");
    return;
  }

  if (value.checks !== checkCount) failures.push("readiness summary checks count is inconsistent");
  if (value.passed !== passedCount) failures.push("readiness summary passed count is inconsistent");
  if (value.failed !== failedCount) failures.push("readiness summary failed count is inconsistent");
  const expectedOverall = failedCount === 0 ? "passed" : "failed";
  if (value.overall !== expectedOverall) failures.push("readiness summary overall is inconsistent");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isHexString(value: unknown, byteLength: number): value is string {
  return typeof value === "string" && new RegExp(`^[0-9a-fA-F]{${byteLength * 2}}$`).test(value);
}
